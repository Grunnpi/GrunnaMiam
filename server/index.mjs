// Serveur de production : sert le site compilé (dist/) + l'API /api, sur un seul port.
// Aucune dépendance npm : il suffit de Node.js >= 18.
//
// Variables d'environnement (toutes optionnelles) :
//   PORT      port d'écoute            (défaut : 3100)
//   HOST      interface d'écoute       (défaut : 0.0.0.0)
//   DATA_DIR  dossier des données      (défaut : <projet>/data)
//   DIST_DIR  dossier du site compilé  (défaut : <projet>/dist)
//   DISABLE_UPDATE=1        désactive le bouton de mise à jour (réservé aux administrateurs)
//   GRUNNAMIAM_SUPERVISED=1  le serveur est relancé par deploy/start-synology.sh après une mise à jour

import http from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.mjs";
import { createUpdater } from "./update.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(ROOT, "dist"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const updater =
  process.env.DISABLE_UPDATE === "1"
    ? undefined
    : createUpdater({ rootDir: ROOT, supervised: process.env.GRUNNAMIAM_SUPERVISED === "1" });
const api = createApi({ dataDir: DATA_DIR, rootDir: ROOT, updater });

function plain(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return plain(res, 405, "Méthode non autorisée");

  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return plain(res, 400, "URL invalide");
  }

  let file = path.join(DIST_DIR, relative);
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) return plain(res, 403, "Interdit");

  let stat = await fs.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, "index.html");
    stat = await fs.stat(file).catch(() => null);
  }

  if (!stat) {
    // Une URL avec extension (image, script…) qui n'existe pas : vraie 404.
    if (path.extname(relative)) return plain(res, 404, "Introuvable");
    // Sinon : application monopage, on renvoie index.html.
    file = path.join(DIST_DIR, "index.html");
    stat = await fs.stat(file).catch(() => null);
    if (!stat) return plain(res, 503, `Site compilé introuvable dans ${DIST_DIR} (lancez « npm run build »).`);
  }

  const isHashedAsset = pathname.startsWith("/assets/");
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": stat.size,
    // index.html et sw.js ne doivent jamais rester en cache, sinon les mises à jour ne passent pas.
    "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}

// ── Liens partagés : page d'une recette avec balises d'aperçu (Open Graph) ──
const escapeHtml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function publicOrigin(req) {
  const first = (value) => (typeof value === "string" ? value.split(",")[0].trim() : "");
  const proto = first(req.headers["x-forwarded-proto"]) || (req.socket.encrypted ? "https" : "http");
  const host = first(req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
  // Valeurs inattendues (en-têtes falsifiés) : on retombe sur une origine neutre
  return /^https?$/.test(proto) && /^[A-Za-z0-9.\-:[\]]+$/.test(host) ? `${proto}://${host}` : "http://localhost";
}

function shareDescription(recipe) {
  const description = typeof recipe.description === "string" ? recipe.description.trim() : "";
  if (description) return description.slice(0, 200);
  const ingredients = (recipe.ingredients ?? [])
    .map((item) => item.name)
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
  return [
    recipe.time ? `Temps : ${recipe.time}` : "",
    `${recipe.servings} personne${recipe.servings > 1 ? "s" : ""}`,
    ingredients ? `Ingrédients : ${ingredients}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);
}

/** Renvoie true si la réponse a été envoyée ; false pour laisser le service normal du site (recette inconnue, site non compilé). */
async function serveSharedRecipe(req, res, id) {
  const recipe = await api.getRecipe(id);
  if (!recipe) return false;

  let html;
  try {
    html = await fs.readFile(path.join(DIST_DIR, "index.html"), "utf8");
  } catch {
    return false;
  }

  const origin = publicOrigin(req);
  const title = `${recipe.title} · Recettes`;
  const description = shareDescription(recipe);
  const image =
    typeof recipe.image === "string" && !/\.svg$/i.test(recipe.image)
      ? recipe.image.startsWith("/api/images/")
        ? `${origin}${recipe.image}`
        : /^https?:\/\//i.test(recipe.image)
          ? recipe.image
          : ""
      : "";

  const tags = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Recettes">`,
    `<meta property="og:title" content="${escapeHtml(recipe.title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/recette/${id}`)}">`,
    image && `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
  ]
    .filter(Boolean)
    .join("\n    ");

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/<\/head>/i, () => `    ${tags}\n  </head>`);

  const body = Buffer.from(html, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (await api.handle(req, res)) return;
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    // Lien partagé /recette/123 : même application, avec un aperçu (titre, description, photo) pour les messageries
    const shared = pathname.match(/^\/recette\/(\d+)\/?$/);
    if (shared && (req.method === "GET" || req.method === "HEAD") && (await serveSharedRecipe(req, res, Number(shared[1])))) return;

    await serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

// Erreurs d'écoute fréquentes : message clair plutôt qu'une trace d'exception.
server.on("error", (error) => {
  if (error.code === "EACCES" || error.code === "EADDRINUSE") {
    console.error(`[${new Date().toISOString()}] Impossible d'écouter sur ${HOST}:${PORT} (${error.code}).`);
    console.error(
      error.code === "EADDRINUSE"
        ? "  Ce port est déjà utilisé par un autre programme (ou une autre instance du serveur)."
        : "  Accès refusé à ce port. Sous Windows, il est souvent réservé par le système (Hyper-V, WSL, Docker) : " +
            "vérifiez avec « netsh interface ipv4 show excludedportrange protocol=tcp »."
    );
    console.error("  Choisissez un autre port avec la variable PORT (ex. PORT=3200, ou « export PORT=3200 » dans deploy/config.sh).");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`[${new Date().toISOString()}] GrunnaMiam démarré sur http://${HOST}:${PORT}`);
  console.log(`  site    : ${DIST_DIR}`);
  console.log(`  données : ${DATA_DIR}`);
  console.log(`  mise à jour depuis l'app (administrateurs) : ${updater ? (updater.supervised ? "activée, redémarrage auto" : "activée, redémarrage manuel") : "désactivée (DISABLE_UPDATE=1)"}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`${signal} reçu, arrêt en cours…`);
    server.close();
    server.closeAllConnections?.();
    api.idle().finally(() => process.exit(0));
  });
}

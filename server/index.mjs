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

const server = http.createServer(async (req, res) => {
  try {
    if (await api.handle(req, res)) return;
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    await serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
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

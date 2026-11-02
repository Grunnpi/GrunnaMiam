// API REST minimaliste, sans aucune dépendance npm.
//
// Persistance :
//   <dataDir>/db.json          recettes + listes de préférences (écriture atomique, copie .bak)
//   <dataDir>/images/<sha1>.*  images extraites des recettes (dédoublonnées par hash)
//
// Utilisé à la fois par le serveur de production (server/index.mjs)
// et par le serveur Vite (npm run dev / npm run preview).

import { promises as fs, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import { createAuth } from "./auth.mjs";

const IMAGE_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const IMAGE_MIME = Object.fromEntries(Object.entries(IMAGE_EXT).map(([mime, ext]) => [ext, mime]));
const IMAGE_URL_PREFIX = "/api/images/";
const IMAGE_NAME = /^[a-f0-9]{40}\.(jpg|png|gif|webp|svg)$/;
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isString = (value) => typeof value === "string";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

function validateRecipe(recipe) {
  const valid =
    recipe &&
    typeof recipe === "object" &&
    isNumber(recipe.id) &&
    isString(recipe.title) &&
    isString(recipe.image) &&
    isString(recipe.time) &&
    isNumber(recipe.servings) &&
    ["Facile", "Moyen", "Difficile"].includes(recipe.difficulty) &&
    isString(recipe.description) &&
    Array.isArray(recipe.tags) &&
    recipe.tags.every(isString) &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.every((i) => i && isString(i.name) && isString(i.quantity)) &&
    Array.isArray(recipe.steps) &&
    recipe.steps.every(
      (s) =>
        s &&
        isString(s.title) &&
        isString(s.instruction) &&
        Array.isArray(s.photos) &&
        s.photos.every(isString)
    );
  if (!valid) throw new HttpError(400, "Recette invalide.");
}

function validateLists(lists) {
  const valid =
    Array.isArray(lists) &&
    lists.every(
      (l) =>
        l &&
        isNumber(l.id) &&
        isString(l.name) &&
        Array.isArray(l.recipeIds) &&
        l.recipeIds.every(isNumber)
    );
  if (!valid) throw new HttpError(400, "Listes invalides.");
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Requête trop volumineuse.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

/**
 * @param {{ dataDir: string, rootDir?: string, updater?: ReturnType<typeof import("./update.mjs").createUpdater> }} options
 */
export function createApi({ dataDir, rootDir, updater }) {
  const dbFile = path.join(dataDir, "db.json");
  const imagesDir = path.join(dataDir, "images");
  const auth = createAuth({ dataDir });

  // Informations sur le processus en cours : version, commit git et heure de démarrage.
  const startedAt = new Date().toISOString();
  let version = "0.0.0";
  let commitPromise = Promise.resolve(null);
  if (rootDir) {
    try {
      version = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).version ?? version;
    } catch {
      /* package.json illisible : on garde la valeur par défaut */
    }
    commitPromise = new Promise((resolve) => {
      execFile("git", ["rev-parse", "--short", "HEAD"], { cwd: rootDir, windowsHide: true }, (error, stdout) =>
        resolve(error ? null : stdout.trim() || null)
      );
    });
  }

  /** @type {{ initialized: boolean, recipes: any[], preferenceLists: any[] } | null} */
  let db = null;
  let queue = Promise.resolve();

  // Toutes les lectures/écritures passent par cette file : une seule opération à la fois.
  function withLock(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  async function load() {
    if (db) return db;
    let loaded;
    try {
      loaded = JSON.parse(await fs.readFile(dbFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // fichier corrompu : on ne l'écrase surtout pas
      loaded = { initialized: false };
    }
    db = {
      initialized: Boolean(loaded.initialized),
      recipes: Array.isArray(loaded.recipes) ? loaded.recipes : [],
      preferenceLists: Array.isArray(loaded.preferenceLists) ? loaded.preferenceLists : [],
    };
    return db;
  }

  // Écrit db.json de façon atomique, garde l'ancienne version dans db.json.bak.
  async function commit() {
    try {
      db.initialized = true;
      await fs.mkdir(dataDir, { recursive: true });
      const tmp = `${dbFile}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
      await fs.copyFile(dbFile, `${dbFile}.bak`).catch(() => {});
      await fs.rename(tmp, dbFile);
    } catch (error) {
      db = null; // l'état mémoire ne correspond plus au disque : on rechargera depuis le disque
      throw error;
    }
    await collectGarbage();
  }

  // Supprime les images qui ne sont plus référencées par aucune recette.
  async function collectGarbage() {
    try {
      const used = new Set(JSON.stringify(db.recipes).match(/[a-f0-9]{40}\.(?:jpg|png|gif|webp|svg)/g) ?? []);
      const files = await fs.readdir(imagesDir).catch(() => []);
      const now = Date.now();
      await Promise.all(
        files
          .filter((name) => IMAGE_NAME.test(name) && !used.has(name))
          .map(async (name) => {
            const file = path.join(imagesDir, name);
            const stat = await fs.stat(file).catch(() => null);
            if (stat && now - stat.mtimeMs > ORPHAN_GRACE_MS) await fs.unlink(file).catch(() => {});
          })
      );
    } catch (error) {
      console.error("[api] nettoyage des images :", error);
    }
  }

  // data:image/...;base64,... -> fichier sur disque + URL /api/images/<hash>.<ext>
  async function storeImage(source) {
    if (!source.startsWith("data:")) return source;
    const comma = source.indexOf(",");
    if (comma < 0) throw new HttpError(400, "Image invalide.");
    const [mime, encoding] = source.slice(5, comma).split(";");
    const ext = IMAGE_EXT[mime];
    if (!ext || encoding !== "base64") throw new HttpError(400, "Format d'image non supporté.");

    const data = Buffer.from(source.slice(comma + 1), "base64");
    const name = `${crypto.createHash("sha1").update(data).digest("hex")}.${ext}`;
    const file = path.join(imagesDir, name);
    const exists = await fs.access(file).then(() => true, () => false);
    if (!exists) {
      await fs.mkdir(imagesDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, file);
    }
    return IMAGE_URL_PREFIX + name;
  }

  async function normalizeRecipe(recipe) {
    return {
      id: recipe.id,
      title: recipe.title,
      image: await storeImage(recipe.image),
      time: recipe.time,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      tags: recipe.tags,
      ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity })),
      description: recipe.description,
      steps: await Promise.all(
        recipe.steps.map(async (step) => ({
          title: step.title,
          instruction: step.instruction,
          photos: await Promise.all(step.photos.map(storeImage)),
        }))
      ),
    };
  }

  async function sendImage(req, res, name) {
    if (!IMAGE_NAME.test(name)) throw new HttpError(404, "Image introuvable.");
    let data;
    try {
      data = await fs.readFile(path.join(imagesDir, name));
    } catch (error) {
      if (error.code === "ENOENT") throw new HttpError(404, "Image introuvable.");
      throw error;
    }
    res.writeHead(200, {
      "Content-Type": IMAGE_MIME[name.split(".").pop()],
      "Content-Length": data.length,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  }

  async function route(req, res, pathname) {
    const method = req.method ?? "GET";
    let match;

    // Protection CSRF en plus du cookie SameSite=Lax : on refuse toute écriture venant d'un autre site.
    if (method !== "GET" && method !== "HEAD" && req.headers["sec-fetch-site"] === "cross-site") {
      throw new HttpError(403, "Requête inter-sites refusée.");
    }

    if (pathname === "/api/health" && method === "GET") {
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/info" && method === "GET") {
      return sendJson(res, 200, {
        version,
        commit: await commitPromise,
        startedAt,
        updateEnabled: Boolean(updater),
        supervised: Boolean(updater?.supervised),
      });
    }

    if (pathname === "/api/update") {
      if (!updater) throw new HttpError(404, "La mise à jour depuis l'application n'est pas activée sur ce serveur.");
      await auth.requireAdmin(req);
      if (method === "GET") return sendJson(res, 200, updater.getStatus());
      if (method === "POST") return sendJson(res, 202, updater.start());
      throw new HttpError(405, "Méthode non autorisée.");
    }

    // ── Comptes et sessions ──
    if (pathname === "/api/auth/me" && method === "GET") {
      return sendJson(res, 200, await auth.me(req));
    }

    if (pathname === "/api/auth/setup" && method === "POST") {
      const { state, cookie } = await auth.setup(req, await readJson(req));
      return sendJson(res, 200, state, { "Set-Cookie": cookie });
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const { state, cookie } = await auth.login(req, await readJson(req));
      return sendJson(res, 200, state, { "Set-Cookie": cookie });
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      return sendJson(res, 200, { user: null, setupRequired: false }, { "Set-Cookie": auth.logoutCookie(req) });
    }

    if (pathname === "/api/auth/password" && method === "POST") {
      const user = await auth.requireUser(req);
      const cookie = await auth.changePassword(req, user, await readJson(req));
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookie });
    }

    if (pathname === "/api/users" && method === "GET") {
      await auth.requireAdmin(req);
      return sendJson(res, 200, await auth.listUsers());
    }

    if (pathname === "/api/users" && method === "POST") {
      await auth.requireAdmin(req);
      return sendJson(res, 201, await auth.createUser(await readJson(req)));
    }

    if ((match = pathname.match(/^\/api\/users\/(\d+)$/)) && method === "DELETE") {
      const actor = await auth.requireAdmin(req);
      await auth.deleteUser(actor, Number(match[1]));
      return sendJson(res, 200, { ok: true });
    }

    if ((match = pathname.match(/^\/api\/users\/(\d+)\/password$/)) && method === "POST") {
      await auth.requireAdmin(req);
      const body = await readJson(req);
      await auth.resetPassword(Number(match[1]), body?.password);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/data" && method === "GET") {
      const data = await withLock(async () => {
        const current = await load();
        return {
          initialized: current.initialized,
          recipes: current.recipes,
          preferenceLists: current.preferenceLists,
        };
      });
      return sendJson(res, 200, data);
    }

    if ((match = pathname.match(/^\/api\/images\/([^/]+)$/)) && (method === "GET" || method === "HEAD")) {
      return sendImage(req, res, match[1]);
    }

    if ((match = pathname.match(/^\/api\/recipes\/(\d+)$/)) && method === "PUT") {
      await auth.requireUser(req);
      const body = await readJson(req);
      validateRecipe(body);
      if (body.id !== Number(match[1])) throw new HttpError(400, "Identifiant incohérent.");
      const stored = await withLock(async () => {
        const recipe = await normalizeRecipe(body);
        const current = await load();
        const index = current.recipes.findIndex((r) => r.id === recipe.id);
        if (index >= 0) current.recipes[index] = recipe;
        else current.recipes.push(recipe);
        await commit();
        return recipe;
      });
      return sendJson(res, 200, stored);
    }

    if (pathname === "/api/recipes/delete" && method === "POST") {
      await auth.requireUser(req);
      const body = await readJson(req);
      if (!body || !Array.isArray(body.ids) || !body.ids.every(isNumber)) {
        throw new HttpError(400, "Liste d'identifiants invalide.");
      }
      const ids = new Set(body.ids);
      const deleted = await withLock(async () => {
        const current = await load();
        const before = current.recipes.length;
        current.recipes = current.recipes.filter((r) => !ids.has(r.id));
        await commit();
        return before - current.recipes.length;
      });
      return sendJson(res, 200, { deleted });
    }

    if (pathname === "/api/lists" && method === "PUT") {
      await auth.requireUser(req);
      const body = await readJson(req);
      validateLists(body);
      await withLock(async () => {
        const current = await load();
        current.preferenceLists = body.map((l) => ({ id: l.id, name: l.name, recipeIds: l.recipeIds }));
        await commit();
      });
      return sendJson(res, 200, { ok: true });
    }

    throw new HttpError(404, "Route inconnue.");
  }

  /**
   * Traite la requête si elle commence par /api. Renvoie true si elle a été traitée.
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;

    try {
      await route(req, res, pathname);
    } catch (error) {
      const status = typeof error?.status === "number" ? error.status : 500;
      if (status === 500) console.error("[api]", error);
      if (res.headersSent) res.destroy();
      else sendJson(res, status, { error: status === 500 ? "Erreur interne du serveur." : error.message });
    }
    return true;
  }

  /** Résolu quand toutes les écritures en cours sont terminées (utile à l'arrêt). */
  const idle = () => queue;

  return { handle, idle };
}

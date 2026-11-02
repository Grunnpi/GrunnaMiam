// Comptes utilisateurs et sessions, sans dépendance npm.
//
// Stockage (dans le dossier de données) :
//   users.json   comptes : mot de passe haché avec scrypt (sel aléatoire par compte)
//   session.key  clé secrète servant à signer les cookies de session (créée au premier usage)
//
// Session : cookie HttpOnly signé (HMAC-SHA256), valable 30 jours. Elle ne dépend d'aucun état
// en mémoire : elle survit donc aux redémarrages du serveur (mises à jour comprises).
// Changer ou réinitialiser un mot de passe invalide les sessions existantes du compte.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = "gm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const KEY_LENGTH = 64;
const DUMMY_SALT = "00".repeat(16);
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const publicUser = (user) => ({ id: user.id, username: user.username, role: user.role });

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * @param {{ dataDir: string }} options
 */
export function createAuth({ dataDir }) {
  const usersFile = path.join(dataDir, "users.json");
  const secretFile = path.join(dataDir, "session.key");

  let cache = null; // { users, mtimeMs }
  let secret = null;
  let queue = Promise.resolve();
  const failures = new Map(); // adresse IP -> horodatages des échecs récents

  function withLock(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  // ── Fichier des comptes ──────────────────────────────────────────────────
  // Rechargé dès que le fichier change : le script server/users-cli.mjs peut le modifier serveur allumé.
  async function readUsers() {
    let stat;
    try {
      stat = await fs.stat(usersFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      cache = { users: [], mtimeMs: 0 };
      return cache.users;
    }
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.users;
    const parsed = JSON.parse(await fs.readFile(usersFile, "utf8"));
    cache = { users: Array.isArray(parsed.users) ? parsed.users : [], mtimeMs: stat.mtimeMs };
    return cache.users;
  }

  async function writeUsers(users) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${usersFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ users }, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, usersFile);
    cache = { users, mtimeMs: (await fs.stat(usersFile)).mtimeMs };
  }

  async function getSecret() {
    if (secret) return secret;
    const readExisting = async () => Buffer.from((await fs.readFile(secretFile, "utf8")).trim(), "hex");
    try {
      secret = await readExisting();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(dataDir, { recursive: true });
      const fresh = crypto.randomBytes(32);
      try {
        await fs.writeFile(secretFile, fresh.toString("hex"), { mode: 0o600, flag: "wx" });
        secret = fresh;
      } catch (writeError) {
        if (writeError.code !== "EEXIST") throw writeError;
        secret = await readExisting();
      }
    }
    if (secret.length < 16) throw new Error(`Clé de session invalide : supprimez ${secretFile} pour en générer une nouvelle.`);
    return secret;
  }

  // ── Mots de passe ────────────────────────────────────────────────────────
  async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return { salt: salt.toString("hex"), hash: hash.toString("hex") };
  }

  // Calcule toujours un hachage, même si le compte n'existe pas (temps de réponse identique).
  async function verifyPassword(user, password) {
    const salt = Buffer.from(user?.salt ?? DUMMY_SALT, "hex");
    const actual = await scrypt(password, salt, KEY_LENGTH);
    const expected = Buffer.from(user?.hash ?? "", "hex");
    return Boolean(user) && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function validateUsername(username) {
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      throw httpError(400, "Nom d'utilisateur invalide (3 à 32 caractères : lettres, chiffres, point, tiret, tiret bas).");
    }
  }

  function validatePassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw httpError(400, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
    }
    if (password.length > MAX_PASSWORD_LENGTH) throw httpError(400, "Mot de passe trop long.");
  }

  // ── Limitation des tentatives de connexion (par adresse IP) ───────────────
  function clientKey(req) {
    const forwarded = req.headers["x-forwarded-for"];
    return (typeof forwarded === "string" && forwarded.split(",")[0].trim()) || req.socket.remoteAddress || "?";
  }

  function recentFailures(key) {
    const now = Date.now();
    const recent = (failures.get(key) ?? []).filter((time) => now - time < FAILURE_WINDOW_MS);
    if (recent.length > 0) failures.set(key, recent);
    else failures.delete(key);
    return recent;
  }

  function assertNotThrottled(req) {
    if (recentFailures(clientKey(req)).length >= MAX_FAILURES) {
      throw httpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
  }

  function recordFailure(req) {
    const key = clientKey(req);
    failures.set(key, [...recentFailures(key), Date.now()]);
  }

  // ── Sessions ─────────────────────────────────────────────────────────────
  function buildCookie(req, value, maxAgeSeconds) {
    const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
  }

  async function sessionCookie(req, user) {
    const key = await getSecret();
    const body = Buffer.from(
      JSON.stringify({ u: user.id, v: user.sessionVersion ?? 1, e: Date.now() + SESSION_TTL_MS })
    ).toString("base64url");
    const signature = crypto.createHmac("sha256", key).update(body).digest("base64url");
    return buildCookie(req, `${body}.${signature}`, Math.floor(SESSION_TTL_MS / 1000));
  }

  async function userFromRequest(req) {
    const raw = readCookie(req, COOKIE_NAME);
    if (!raw) return null;
    const [body, signature] = raw.split(".");
    if (!body || !signature) return null;

    const key = await getSecret();
    const expected = crypto.createHmac("sha256", key).update(body).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!payload || typeof payload.e !== "number" || payload.e < Date.now()) return null;

    const user = (await readUsers()).find((candidate) => candidate.id === payload.u);
    return user && (user.sessionVersion ?? 1) === payload.v ? user : null;
  }

  async function requireUser(req) {
    const user = await userFromRequest(req);
    if (!user) throw httpError(401, "Connexion requise.");
    return user;
  }

  async function requireAdmin(req) {
    const user = await requireUser(req);
    if (user.role !== "admin") throw httpError(403, "Réservé aux administrateurs.");
    return user;
  }

  // ── Gestion des comptes ──────────────────────────────────────────────────
  async function createUser(input) {
    const { username, password, role } = input ?? {};
    validateUsername(username);
    validatePassword(password);
    const { salt, hash } = await hashPassword(password);

    return withLock(async () => {
      const users = await readUsers();
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        throw httpError(409, "Ce nom d'utilisateur existe déjà.");
      }
      const created = {
        id: Math.max(Date.now(), ...users.map((u) => u.id)) + 1,
        username,
        role: role === "admin" ? "admin" : "user",
        salt,
        hash,
        sessionVersion: 1,
        createdAt: new Date().toISOString(),
      };
      await writeUsers([...users, created]);
      return { ...publicUser(created), createdAt: created.createdAt };
    });
  }

  async function resetPassword(id, password) {
    validatePassword(password);
    const { salt, hash } = await hashPassword(password);
    return withLock(async () => {
      const users = await readUsers();
      const target = users.find((u) => u.id === id);
      if (!target) throw httpError(404, "Utilisateur introuvable.");
      const updated = { ...target, salt, hash, sessionVersion: (target.sessionVersion ?? 1) + 1 };
      await writeUsers(users.map((u) => (u.id === id ? updated : u)));
      return updated;
    });
  }

  return {
    requireUser,
    requireAdmin,

    async me(req) {
      const users = await readUsers();
      const user = await userFromRequest(req);
      return { user: user ? publicUser(user) : null, setupRequired: users.length === 0 };
    },

    /** Création du tout premier compte (administrateur) : possible uniquement tant qu'aucun compte n'existe. */
    async setup(req, input) {
      const { username, password } = input ?? {};
      validateUsername(username);
      validatePassword(password);
      const { salt, hash } = await hashPassword(password);

      const user = await withLock(async () => {
        const users = await readUsers();
        if (users.length > 0) throw httpError(403, "Un compte existe déjà : la configuration initiale n'est plus possible.");
        const created = {
          id: Date.now(),
          username,
          role: "admin",
          salt,
          hash,
          sessionVersion: 1,
          createdAt: new Date().toISOString(),
        };
        await writeUsers([created]);
        return created;
      });
      return { state: { user: publicUser(user), setupRequired: false }, cookie: await sessionCookie(req, user) };
    },

    async login(req, input) {
      assertNotThrottled(req);
      const { username, password } = input ?? {};
      const users = await readUsers();
      const user =
        typeof username === "string"
          ? users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
          : undefined;
      const valid =
        typeof password === "string" && password.length <= MAX_PASSWORD_LENGTH && (await verifyPassword(user, password));
      if (!valid) {
        recordFailure(req);
        throw httpError(401, "Identifiant ou mot de passe incorrect.");
      }
      return { state: { user: publicUser(user), setupRequired: false }, cookie: await sessionCookie(req, user) };
    },

    logoutCookie: (req) => buildCookie(req, "", 0),

    /** Change son propre mot de passe. Les autres sessions du compte sont fermées ; renvoie le cookie de la session courante. */
    async changePassword(req, user, input) {
      assertNotThrottled(req);
      const { current, next } = input ?? {};
      validatePassword(next);
      if (typeof current !== "string" || !(await verifyPassword(user, current))) {
        recordFailure(req);
        throw httpError(403, "Mot de passe actuel incorrect.");
      }
      const updated = await resetPassword(user.id, next);
      return sessionCookie(req, updated);
    },

    async listUsers() {
      return (await readUsers()).map((u) => ({ ...publicUser(u), createdAt: u.createdAt }));
    },

    createUser,

    async deleteUser(actor, id) {
      if (id === actor.id) throw httpError(400, "Vous ne pouvez pas supprimer votre propre compte.");
      await withLock(async () => {
        const users = await readUsers();
        if (!users.some((u) => u.id === id)) throw httpError(404, "Utilisateur introuvable.");
        await writeUsers(users.filter((u) => u.id !== id));
      });
    },

    async resetPassword(id, password) {
      await resetPassword(id, password);
    },

    /** Utilisé par le script en ligne de commande. */
    async resetPasswordByName(username, password) {
      const target = (await readUsers()).find((u) => u.username.toLowerCase() === String(username).toLowerCase());
      if (!target) throw httpError(404, `Utilisateur « ${username} » introuvable.`);
      await resetPassword(target.id, password);
    },
  };
}

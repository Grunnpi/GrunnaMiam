// Comptes utilisateurs, sessions et journal de connexions, sans dépendance npm.
//
// Stockage (dans le dossier de données) :
//   users.json       comptes : mot de passe haché avec scrypt (sel aléatoire par compte)
//   sessions.json    sessions ouvertes (on ne stocke que l'empreinte SHA-256 du jeton du cookie)
//   auth-log.jsonl   journal des connexions et des actions sensibles (une ligne JSON par événement)
//
// Sessions : cookie HttpOnly contenant un jeton aléatoire. Une session expire après SESSION_DAYS jours
// (7 par défaut) ou après SESSION_IDLE_HOURS heures d'inactivité (48 par défaut). Elles survivent aux
// redémarrages du serveur. Chaque appareil connecté peut être listé puis déconnecté.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = "gm_session";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const SESSION_TTL_MS = envNumber("SESSION_DAYS", 7) * DAY_MS;
const SESSION_IDLE_MS = envNumber("SESSION_IDLE_HOURS", 48) * HOUR_MS;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000; // la « dernière activité » n'est mise à jour que toutes les 5 minutes
const FLUSH_DELAY_MS = 20 * 1000;
const MAX_SESSIONS_PER_USER = 20;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const LOG_MAX_BYTES = 1024 * 1024; // au-delà : le journal est archivé en auth-log.jsonl.1

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;
const KEY_LENGTH = 64;
const DUMMY_SALT = "00".repeat(16);
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

// Blocage par compte, en plus de la limitation par adresse IP : un attaquant qui change d'adresse (ou qui utilise un
// ensemble de machines) pour tester les mots de passe d'un même compte est ralenti quand même.
// Les premiers échecs sont tolérés (fautes de frappe), puis le délai double à chaque échec : 30 s, 1 min, 2 min… 15 min maximum.
const ACCOUNT_FREE_ATTEMPTS = envNumber("LOGIN_FREE_ATTEMPTS", 4);
const ACCOUNT_BASE_LOCK_MS = envNumber("LOGIN_LOCK_SECONDS", 30) * 1000;
const ACCOUNT_MAX_LOCK_MS = envNumber("LOGIN_LOCK_MAX_MINUTES", 15) * 60 * 1000;
const ACCOUNT_RESET_MS = 24 * HOUR_MS; // sans nouvel échec pendant ce délai, le compteur repart de zéro
const MAX_TRACKED_ACCOUNTS = 5000;

function formatWait(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

// Fragments qui rendent un mot de passe prévisible, même s'il est long
const COMMON_FRAGMENTS = [
  "password", "motdepasse", "passw0rd", "azerty", "qwerty", "123456", "654321", "111111", "000000", "abcdef",
  "letmein", "welcome", "bonjour", "soleil", "doudou", "chocolat", "iloveyou", "admin", "changeme", "grunnamiam",
  "recette", "football", "marseille", "superman", "trustno1",
];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const publicUser = (user) => ({ id: user.id, username: user.username, role: user.role });
const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// ── Adresse IP et appareil ───────────────────────────────────────────────────
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Adresse IP du client. Derrière un proxy inversé de confiance (même machine, ou TRUST_PROXY=1), on lit
 * la dernière valeur de X-Forwarded-For ajoutée par ce proxy ; sinon l'en-tête est ignoré (falsifiable).
 */
function clientIp(req) {
  const remote = req.socket.remoteAddress ?? "?";
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && (TRUST_PROXY || LOOPBACK.has(remote))) {
    const last = forwarded.split(",").pop().trim();
    if (last) return last.replace(/^::ffff:/, "");
  }
  return remote.replace(/^::ffff:/, "");
}

function describeDevice(userAgent = "") {
  const os = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(userAgent)
            ? "Mac"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Appareil";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox|FxiOS/.test(userAgent)
        ? "Firefox"
        : /CriOS|Chrome/.test(userAgent)
          ? "Chrome"
          : /Safari/.test(userAgent)
            ? "Safari"
            : "navigateur inconnu";
  return `${os} · ${browser}`;
}

// ── Règles de mot de passe ───────────────────────────────────────────────────
/** Renvoie la raison pour laquelle le mot de passe est refusé, ou null s'il est acceptable. */
export function passwordProblem(password, username = "") {
  if (typeof password !== "string") return "Mot de passe invalide.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "Mot de passe trop long.";

  const plain = password
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (username.length >= 3 && plain.includes(username.toLowerCase())) {
    return "Le mot de passe ne doit pas contenir le nom d'utilisateur.";
  }
  if (new Set(plain).size < 5) return "Mot de passe trop répétitif.";
  if (COMMON_FRAGMENTS.some((fragment) => plain.includes(fragment))) {
    return "Mot de passe trop courant ou prévisible (évitez « azerty », « password », « 123456 »…).";
  }
  return null;
}

/**
 * @param {{ dataDir: string }} options
 */
export function createAuth({ dataDir }) {
  const usersFile = path.join(dataDir, "users.json");
  const sessionsFile = path.join(dataDir, "sessions.json");
  const logFile = path.join(dataDir, "auth-log.jsonl");

  let usersCache = null; // { users, mtimeMs }
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
      usersCache = { users: [], mtimeMs: 0 };
      return usersCache.users;
    }
    if (usersCache && usersCache.mtimeMs === stat.mtimeMs) return usersCache.users;
    const parsed = JSON.parse(await fs.readFile(usersFile, "utf8"));
    usersCache = { users: Array.isArray(parsed.users) ? parsed.users : [], mtimeMs: stat.mtimeMs };
    return usersCache.users;
  }

  async function writeUsers(users) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${usersFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ users }, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, usersFile);
    usersCache = { users, mtimeMs: (await fs.stat(usersFile)).mtimeMs };
  }

  // ── Journal des connexions ───────────────────────────────────────────────
  let logChain = Promise.resolve();

  /**
   * Ajoute un événement au journal. `req` peut être null (script en ligne de commande).
   * Champs usuels : user (nom du compte connecté, ou nom saisi lors d'un échec), target, detail.
   */
  function audit(req, event, fields = {}) {
    const entry = {
      t: new Date().toISOString(),
      event,
      ip: req ? clientIp(req) : "local",
      device: req ? describeDevice(req.headers["user-agent"]) : "ligne de commande",
      ...fields,
    };
    logChain = logChain
      .then(async () => {
        await fs.mkdir(dataDir, { recursive: true });
        try {
          if ((await fs.stat(logFile)).size > LOG_MAX_BYTES) await fs.rename(logFile, `${logFile}.1`);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        await fs.appendFile(logFile, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
      })
      .catch((error) => console.error("[auth] journal :", error.message));
    return logChain;
  }

  async function readAuditLog(limit = 200) {
    await logChain;
    const lines = [];
    for (const file of [`${logFile}.1`, logFile]) {
      try {
        lines.push(...(await fs.readFile(file, "utf8")).split("\n").filter(Boolean));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  const safeName = (value) => (typeof value === "string" && USERNAME_RE.test(value.trim()) ? value.trim() : null);

  // ── Sessions ─────────────────────────────────────────────────────────────
  let sessions = null; // Map<id, session>
  let sessionsPromise = null;
  let dirty = false;
  let flushTimer = null;
  let flushChain = Promise.resolve();

  function pruneSessions() {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) {
        sessions.delete(id);
        dirty = true;
      }
    }
  }

  function getSessions() {
    sessionsPromise ??= (async () => {
      const map = new Map();
      try {
        const parsed = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
        for (const session of parsed.sessions ?? []) map.set(session.id, session);
      } catch (error) {
        if (error.code !== "ENOENT") console.error("[auth] sessions.json illisible, sessions ignorées :", error.message);
      }
      sessions = map;
      pruneSessions();
      return map;
    })();
    return sessionsPromise;
  }

  function flush() {
    flushChain = flushChain
      .then(async () => {
        if (!sessions || !dirty) return;
        dirty = false;
        pruneSessions();
        await fs.mkdir(dataDir, { recursive: true });
        const tmp = `${sessionsFile}.tmp`;
        await fs.writeFile(tmp, JSON.stringify({ sessions: [...sessions.values()] }), { encoding: "utf8", mode: 0o600 });
        await fs.rename(tmp, sessionsFile);
      })
      .catch((error) => {
        dirty = true;
        console.error("[auth] enregistrement des sessions :", error.message);
      });
    return flushChain;
  }

  // Les mises à jour de « dernière activité » sont regroupées ; les connexions/déconnexions sont écrites tout de suite.
  function scheduleFlush() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_DELAY_MS);
    flushTimer.unref?.();
  }

  async function createSession(req, user) {
    const map = await getSessions();
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const session = {
      id: sha256Hex(token),
      userId: user.id,
      v: user.sessionVersion ?? 1,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_TTL_MS,
      ip: clientIp(req),
      device: describeDevice(req.headers["user-agent"]),
    };
    map.set(session.id, session);

    const mine = [...map.values()].filter((item) => item.userId === user.id).sort((a, b) => a.createdAt - b.createdAt);
    while (mine.length > MAX_SESSIONS_PER_USER) map.delete(mine.shift().id);

    dirty = true;
    await flush();
    return token;
  }

  async function dropSessions(userId, exceptId = null) {
    const map = await getSessions();
    let count = 0;
    for (const [id, session] of map) {
      if (session.userId === userId && id !== exceptId) {
        map.delete(id);
        count++;
      }
    }
    if (count > 0) {
      dirty = true;
      await flush();
    }
    return count;
  }

  function buildCookie(req, value, maxAgeSeconds) {
    const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
  }

  const sessionCookie = (req, token) => buildCookie(req, token, Math.floor(SESSION_TTL_MS / 1000));

  /** Renvoie { user, session } si la requête porte une session valide, sinon null. */
  async function authenticate(req) {
    const token = readCookie(req, COOKIE_NAME);
    if (!token || token.length > 200) return null;

    const map = await getSessions();
    const session = map.get(sha256Hex(token));
    if (!session) return null;

    const now = Date.now();
    const user = (await readUsers()).find((candidate) => candidate.id === session.userId);
    const expired = now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS;
    // La version change quand le mot de passe est modifié ou réinitialisé : toutes les anciennes sessions tombent.
    if (expired || !user || (user.sessionVersion ?? 1) !== session.v) {
      map.delete(session.id);
      scheduleFlush();
      return null;
    }

    if (now - session.lastSeenAt > TOUCH_INTERVAL_MS) {
      session.lastSeenAt = now;
      session.ip = clientIp(req);
      scheduleFlush();
    }
    return { user, session };
  }

  async function requireSession(req) {
    const current = await authenticate(req);
    if (!current) throw httpError(401, "Connexion requise.");
    return current;
  }

  async function requireUser(req) {
    return (await requireSession(req)).user;
  }

  async function requireAdmin(req) {
    const user = await requireUser(req);
    if (user.role !== "admin") throw httpError(403, "Réservé aux administrateurs.");
    return user;
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

  function validatePassword(password, username) {
    const problem = passwordProblem(password, username);
    if (problem) throw httpError(400, problem);
  }

  // ── Limitation des tentatives de connexion (par adresse IP) ───────────────
  function recentFailures(key) {
    const now = Date.now();
    const recent = (failures.get(key) ?? []).filter((time) => now - time < FAILURE_WINDOW_MS);
    if (recent.length > 0) failures.set(key, recent);
    else failures.delete(key);
    return recent;
  }

  function assertNotThrottled(req) {
    if (recentFailures(clientIp(req)).length >= MAX_FAILURES) {
      throw httpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
  }

  function recordFailure(req) {
    const key = clientIp(req);
    failures.set(key, [...recentFailures(key), Date.now()]);
  }

  // ── Blocage par compte (en mémoire : un redémarrage du serveur remet les compteurs à zéro) ──
  // Les noms inconnus sont comptés comme les autres : on ne peut pas déduire d'un blocage si un compte existe.
  const accountFailures = new Map(); // nom en minuscules -> { count, lockedUntil, lastAt }
  const accountKey = (username) => String(username ?? "").trim().toLowerCase().slice(0, 64);

  /** Millisecondes restantes avant la fin du blocage du compte (0 s'il n'est pas bloqué). */
  function accountLockRemaining(key) {
    const entry = accountFailures.get(key);
    if (!entry) return 0;
    const now = Date.now();
    if (now - entry.lastAt > ACCOUNT_RESET_MS) {
      accountFailures.delete(key);
      return 0;
    }
    return Math.max(0, entry.lockedUntil - now);
  }

  /** Enregistre un échec ; renvoie la durée (ms) du blocage qui en résulte, ou 0. */
  function recordAccountFailure(key) {
    if (!key) return 0;
    const now = Date.now();
    let entry = accountFailures.get(key);
    if (!entry || now - entry.lastAt > ACCOUNT_RESET_MS) entry = { count: 0, lockedUntil: 0, lastAt: now };

    entry.count += 1;
    entry.lastAt = now;
    const excess = entry.count - ACCOUNT_FREE_ATTEMPTS;
    if (excess > 0) {
      entry.lockedUntil = now + Math.min(ACCOUNT_MAX_LOCK_MS, ACCOUNT_BASE_LOCK_MS * 2 ** (excess - 1));
    }
    accountFailures.delete(key); // réinsère en fin de table : les plus anciennes entrées sont supprimées en premier
    accountFailures.set(key, entry);
    while (accountFailures.size > MAX_TRACKED_ACCOUNTS) accountFailures.delete(accountFailures.keys().next().value);

    return Math.max(0, entry.lockedUntil - now);
  }

  const clearAccountFailures = (key) => accountFailures.delete(key);

  // ── Gestion des comptes ──────────────────────────────────────────────────
  async function createUser(req, input, actor) {
    const { username, password, role } = input ?? {};
    validateUsername(username);
    validatePassword(password, username);
    const { salt, hash } = await hashPassword(password);

    const created = await withLock(async () => {
      const users = await readUsers();
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        throw httpError(409, "Ce nom d'utilisateur existe déjà.");
      }
      const user = {
        id: Math.max(Date.now(), ...users.map((u) => u.id)) + 1,
        username,
        role: role === "admin" ? "admin" : "user",
        salt,
        hash,
        sessionVersion: 1,
        createdAt: new Date().toISOString(),
      };
      await writeUsers([...users, user]);
      return user;
    });
    void audit(req, "user_created", { user: actor?.username ?? null, target: created.username, detail: created.role });
    return { ...publicUser(created), createdAt: created.createdAt };
  }

  // Change le mot de passe et incrémente sessionVersion : toutes les sessions existantes du compte tombent.
  async function setPassword(id, password) {
    const target = (await readUsers()).find((u) => u.id === id);
    if (!target) throw httpError(404, "Utilisateur introuvable.");
    validatePassword(password, target.username);
    const { salt, hash } = await hashPassword(password);
    return withLock(async () => {
      const users = await readUsers();
      const current = users.find((u) => u.id === id);
      if (!current) throw httpError(404, "Utilisateur introuvable.");
      const updated = { ...current, salt, hash, sessionVersion: (current.sessionVersion ?? 1) + 1 };
      await writeUsers(users.map((u) => (u.id === id ? updated : u)));
      return updated;
    });
  }

  return {
    requireUser,
    requireAdmin,
    requireSession,
    audit,
    readAuditLog,

    /** À appeler avant l'arrêt du serveur : écrit les sessions en attente. */
    flush,

    async me(req) {
      const users = await readUsers();
      const current = await authenticate(req);
      return { user: current ? publicUser(current.user) : null, setupRequired: users.length === 0 };
    },

    /** Création du tout premier compte (administrateur) : possible uniquement tant qu'aucun compte n'existe. */
    async setup(req, input) {
      const { username, password } = input ?? {};
      validateUsername(username);
      validatePassword(password, username);
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
          lastLoginAt: new Date().toISOString(),
        };
        await writeUsers([created]);
        return created;
      });
      void audit(req, "setup", { user: user.username });
      const token = await createSession(req, user);
      return { state: { user: publicUser(user), setupRequired: false }, cookie: sessionCookie(req, token) };
    },

    async login(req, input) {
      const { username, password } = input ?? {};
      try {
        assertNotThrottled(req);
      } catch (error) {
        void audit(req, "login_blocked", { user: safeName(username) });
        throw error;
      }

      const key = accountKey(username);
      const wait = accountLockRemaining(key);
      if (wait > 0) {
        void audit(req, "login_blocked", { user: safeName(username), detail: `compte verrouillé, encore ${formatWait(wait)}` });
        throw httpError(429, `Trop d'échecs sur ce compte. Réessayez dans ${formatWait(wait)}.`);
      }

      const users = await readUsers();
      const user =
        typeof username === "string"
          ? users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
          : undefined;
      const valid =
        typeof password === "string" && password.length <= MAX_PASSWORD_LENGTH && (await verifyPassword(user, password));
      if (!valid) {
        recordFailure(req);
        const lockMs = recordAccountFailure(key);
        const reason = user ? "mot de passe incorrect" : "compte inconnu";
        void audit(req, "login_failed", {
          user: safeName(username),
          detail: lockMs > 0 ? `${reason} · compte verrouillé ${formatWait(lockMs)}` : reason,
        });
        throw lockMs > 0
          ? httpError(429, `Identifiant ou mot de passe incorrect. Trop d'échecs : ce compte est verrouillé pendant ${formatWait(lockMs)}.`)
          : httpError(401, "Identifiant ou mot de passe incorrect.");
      }
      clearAccountFailures(key);

      await withLock(async () => {
        const all = await readUsers();
        await writeUsers(all.map((u) => (u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u)));
      });
      void audit(req, "login_success", { user: user.username });
      const token = await createSession(req, user);
      return { state: { user: publicUser(user), setupRequired: false }, cookie: sessionCookie(req, token) };
    },

    /** Ferme la session courante ; renvoie le cookie qui efface celui du navigateur. */
    async logout(req) {
      const current = await authenticate(req);
      if (current) {
        (await getSessions()).delete(current.session.id);
        dirty = true;
        await flush();
        void audit(req, "logout", { user: current.user.username });
      }
      return buildCookie(req, "", 0);
    },

    /** Change son propre mot de passe. Les autres appareils sont déconnectés, la session courante est conservée. */
    async changePassword(req, { user, session }, input) {
      try {
        assertNotThrottled(req);
      } catch (error) {
        void audit(req, "login_blocked", { user: user.username, detail: "changement de mot de passe" });
        throw error;
      }
      const accountId = accountKey(user.username);
      const lockedFor = accountLockRemaining(accountId);
      if (lockedFor > 0) {
        void audit(req, "login_blocked", { user: user.username, detail: `compte verrouillé, encore ${formatWait(lockedFor)} (changement de mot de passe)` });
        throw httpError(429, `Trop d'échecs sur ce compte. Réessayez dans ${formatWait(lockedFor)}.`);
      }
      const { current, next } = input ?? {};
      validatePassword(next, user.username);
      if (typeof current !== "string" || !(await verifyPassword(user, current))) {
        recordFailure(req);
        const lockMs = recordAccountFailure(accountId);
        void audit(req, "login_failed", {
          user: user.username,
          detail: `mot de passe actuel incorrect (changement de mot de passe)${lockMs > 0 ? ` · compte verrouillé ${formatWait(lockMs)}` : ""}`,
        });
        throw lockMs > 0
          ? httpError(429, `Mot de passe actuel incorrect. Trop d'échecs : ce compte est verrouillé pendant ${formatWait(lockMs)}.`)
          : httpError(403, "Mot de passe actuel incorrect.");
      }
      clearAccountFailures(accountId);
      const updated = await setPassword(user.id, next);
      session.v = updated.sessionVersion; // la session courante reste valide
      await dropSessions(user.id, session.id);
      dirty = true;
      await flush();
      void audit(req, "password_changed", { user: user.username });
    },

    // ── Appareils connectés ──
    async listSessions({ user, session }) {
      const map = await getSessions();
      return [...map.values()]
        .filter((item) => item.userId === user.id)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .map((item) => ({
          id: item.id,
          device: item.device,
          ip: item.ip,
          createdAt: new Date(item.createdAt).toISOString(),
          lastSeenAt: new Date(item.lastSeenAt).toISOString(),
          expiresAt: new Date(item.expiresAt).toISOString(),
          current: item.id === session.id,
        }));
    },

    async revokeSession(req, { user, session }, id) {
      const map = await getSessions();
      const target = map.get(id);
      if (!target || target.userId !== user.id) throw httpError(404, "Appareil introuvable.");
      map.delete(id);
      dirty = true;
      await flush();
      void audit(req, "session_revoked", { user: user.username, detail: target.device });
      return { current: id === session.id };
    },

    async revokeOtherSessions(req, { user, session }) {
      const count = await dropSessions(user.id, session.id);
      void audit(req, "sessions_revoked", { user: user.username, detail: `${count} autre(s) appareil(s)` });
      return { revoked: count };
    },

    // ── Administration des comptes ──
    async listUsers() {
      return (await readUsers()).map((u) => {
        const wait = accountLockRemaining(accountKey(u.username));
        return {
          ...publicUser(u),
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt ?? null,
          lockedUntil: wait > 0 ? new Date(Date.now() + wait).toISOString() : null,
        };
      });
    },

    /** Lève tout de suite le blocage temporaire d'un compte (trop d'échecs de connexion). */
    async unlockAccount(req, id, actor) {
      const target = (await readUsers()).find((u) => u.id === id);
      if (!target) throw httpError(404, "Utilisateur introuvable.");
      const key = accountKey(target.username);
      const wasLocked = accountLockRemaining(key) > 0;
      clearAccountFailures(key);
      void audit(req, "account_unlocked", {
        user: actor.username,
        target: target.username,
        detail: wasLocked ? "blocage levé" : "compteur d'échecs remis à zéro",
      });
      return { unlocked: wasLocked };
    },

    createUser,

    async deleteUser(req, actor, id) {
      if (id === actor.id) throw httpError(400, "Vous ne pouvez pas supprimer votre propre compte.");
      const removed = await withLock(async () => {
        const users = await readUsers();
        const target = users.find((u) => u.id === id);
        if (!target) throw httpError(404, "Utilisateur introuvable.");
        await writeUsers(users.filter((u) => u.id !== id));
        return target;
      });
      await dropSessions(id);
      void audit(req, "user_deleted", { user: actor.username, target: removed.username });
    },

    async resetPassword(req, id, password, actor) {
      const updated = await setPassword(id, password);
      await dropSessions(id);
      void audit(req, "password_reset", { user: actor.username, target: updated.username });
    },

    /** Change le type d'un autre compte (utilisateur ↔ administrateur). Effet immédiat : le rôle est relu à chaque requête. */
    async setRole(req, actor, id, role) {
      if (role !== "admin" && role !== "user") throw httpError(400, "Type de compte invalide.");
      if (id === actor.id) throw httpError(400, "Vous ne pouvez pas modifier votre propre type de compte.");

      const { target, previous } = await withLock(async () => {
        const users = await readUsers();
        const found = users.find((u) => u.id === id);
        if (!found) throw httpError(404, "Utilisateur introuvable.");
        if (found.role === role) return { target: found, previous: found.role };
        const next = users.map((u) => (u.id === id ? { ...u, role } : u));
        if (!next.some((u) => u.role === "admin")) throw httpError(400, "Il doit rester au moins un administrateur.");
        await writeUsers(next);
        return { target: found, previous: found.role };
      });

      if (previous !== role) {
        void audit(req, "role_changed", { user: actor.username, target: target.username, detail: `${previous} → ${role}` });
      }
      return { ...publicUser(target), role, createdAt: target.createdAt, lastLoginAt: target.lastLoginAt ?? null };
    },

    async revokeUserSessions(req, id, actor) {
      const target = (await readUsers()).find((u) => u.id === id);
      if (!target) throw httpError(404, "Utilisateur introuvable.");
      const count = await dropSessions(id);
      void audit(req, "sessions_revoked", { user: actor.username, target: target.username, detail: `${count} appareil(s)` });
      return { revoked: count };
    },

    /** Utilisé par le script en ligne de commande. */
    async resetPasswordByName(username, password) {
      const target = (await readUsers()).find((u) => u.username.toLowerCase() === String(username).toLowerCase());
      if (!target) throw httpError(404, `Utilisateur « ${username} » introuvable.`);
      await setPassword(target.id, password);
      await dropSessions(target.id);
      await audit(null, "password_reset", { user: "(ligne de commande)", target: target.username });
    },
  };
}

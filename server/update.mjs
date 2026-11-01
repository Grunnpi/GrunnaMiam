// Mise à jour de l'application depuis l'application elle-même :
//   git pull  ->  npm ci (seulement si package-lock.json a changé)  ->  npm run build  ->  redémarrage
//
// Sécurité : activé uniquement si la variable UPDATE_TOKEN est définie, et chaque appel
// doit présenter ce jeton (Authorization: Bearer <jeton>). Aucune commande n'est
// construite à partir de données envoyées par le navigateur : les étapes sont fixes.
//
// Redémarrage : le serveur se termine proprement (SIGTERM) et c'est le script
// deploy/start-synology.sh (boucle de relance) qui le relance. Sans ce superviseur
// (GRUNNAMIAM_SUPERVISED=1), on ne redémarre pas : on demande de le faire à la main.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const MAX_LOG_LINES = 400;
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const RESTART_DELAY_MS = 2500;
const MAX_FAILED_ATTEMPTS = 10;
const FAILED_WINDOW_MS = 60 * 1000;

const STEP_DEFS = [
  { id: "pull", label: "git pull" },
  { id: "install", label: "npm ci (si dépendances modifiées)" },
  { id: "build", label: "npm run build" },
  { id: "restart", label: "Redémarrage du serveur" },
];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest();
const exists = (file) => fs.access(file).then(() => true, () => false);

/**
 * @param {{ rootDir: string, token: string, supervised: boolean }} options
 */
export function createUpdater({ rootDir, token, supervised }) {
  const isWindows = process.platform === "win32";
  const distDir = path.join(rootDir, "dist");
  const nextDir = path.join(rootDir, "dist-next");
  const oldDir = path.join(rootDir, "dist-old");

  // Environnement des commandes : NODE_ENV=production ferait ignorer les devDependencies (vite…),
  // et le jeton n'a rien à faire dans les processus enfants.
  const childEnv = { ...process.env };
  delete childEnv.NODE_ENV;
  delete childEnv.UPDATE_TOKEN;

  let status = freshStatus();
  const failedAttempts = [];

  function freshStatus() {
    return {
      state: "idle", // idle | running | success | error
      startedAt: null,
      finishedAt: null,
      steps: STEP_DEFS.map((step) => ({ ...step, state: "pending" })), // pending | running | done | skipped | error
      log: [],
      restarting: false,
      changed: false,
      message: "",
    };
  }

  function log(line) {
    console.log(`[update] ${line}`);
    status.log.push(line);
    if (status.log.length > MAX_LOG_LINES) status.log.splice(0, status.log.length - MAX_LOG_LINES);
  }

  function setStep(id, state) {
    const step = status.steps.find((s) => s.id === id);
    if (step) step.state = state;
  }

  function run(command, args, { quiet = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!quiet) log(`$ ${[command, ...args].join(" ")}`);
      const child = spawn(command, args, {
        cwd: rootDir,
        env: childEnv,
        shell: isWindows, // npm est un .cmd sous Windows
        windowsHide: true,
      });
      const timer = setTimeout(() => child.kill(), COMMAND_TIMEOUT_MS);
      let output = "";
      const onData = (chunk) => {
        const text = chunk.toString();
        output += text;
        if (!quiet) text.split(/\r?\n/).filter(Boolean).forEach(log);
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`${command} : ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output.trim());
        else reject(new Error(`« ${[command, ...args].join(" ")} » a échoué (code ${code}).`));
      });
    });
  }

  async function lockHash() {
    try {
      return crypto.createHash("sha1").update(await fs.readFile(path.join(rootDir, "package-lock.json"))).digest("hex");
    } catch {
      return "";
    }
  }

  // Compile dans dist-next puis remplace dist d'un coup : le site reste en ligne pendant la compilation.
  async function buildAndSwap() {
    await fs.rm(nextDir, { recursive: true, force: true });
    await run("npm", ["run", "build", "--", "--outDir", "dist-next", "--emptyOutDir"]);
    if (!(await exists(path.join(nextDir, "index.html")))) {
      throw new Error("La compilation n'a pas produit de index.html.");
    }
    await fs.rm(oldDir, { recursive: true, force: true });
    await fs.rename(distDir, oldDir).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await fs.rename(nextDir, distDir);
    await fs.rm(oldDir, { recursive: true, force: true });
  }

  async function perform() {
    const headBefore = await run("git", ["rev-parse", "HEAD"], { quiet: true });
    const lockBefore = await lockHash();

    setStep("pull", "running");
    await run("git", ["pull", "--ff-only"]);
    setStep("pull", "done");

    const headAfter = await run("git", ["rev-parse", "HEAD"], { quiet: true });
    status.changed = headBefore !== headAfter;

    if (!status.changed && (await exists(path.join(distDir, "index.html")))) {
      for (const id of ["install", "build", "restart"]) setStep(id, "skipped");
      status.message = "Déjà à jour : rien à compiler ni à redémarrer.";
      log(status.message);
      return;
    }

    const needInstall = (await lockHash()) !== lockBefore || !(await exists(path.join(rootDir, "node_modules")));
    if (needInstall) {
      setStep("install", "running");
      await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"]);
      setStep("install", "done");
    } else {
      setStep("install", "skipped");
    }

    setStep("build", "running");
    await buildAndSwap();
    setStep("build", "done");

    if (supervised) {
      setStep("restart", "running");
      status.restarting = true;
      status.message = "Mise à jour installée, redémarrage du serveur…";
      log(status.message);
      setTimeout(() => process.kill(process.pid, "SIGTERM"), RESTART_DELAY_MS);
    } else {
      setStep("restart", "skipped");
      status.message = "Mise à jour installée. Redémarrez le serveur à la main pour appliquer les changements côté serveur.";
      log(status.message);
    }
  }

  async function execute() {
    try {
      await perform();
      status.state = "success";
    } catch (error) {
      status.state = "error";
      status.message = error instanceof Error ? error.message : String(error);
      log(`ERREUR : ${status.message}`);
      const running = status.steps.find((s) => s.state === "running");
      if (running) running.state = "error";
    } finally {
      status.finishedAt = new Date().toISOString();
    }
  }

  return {
    supervised,

    /** Lève une erreur 401 (jeton absent/incorrect) ou 429 (trop d'essais). */
    assertAuthorized(req) {
      const now = Date.now();
      while (failedAttempts.length && now - failedAttempts[0] > FAILED_WINDOW_MS) failedAttempts.shift();
      if (failedAttempts.length >= MAX_FAILED_ATTEMPTS) throw httpError(429, "Trop de tentatives, réessayez dans une minute.");

      const header = req.headers.authorization ?? "";
      const given = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!crypto.timingSafeEqual(sha256(given), sha256(token))) {
        failedAttempts.push(now);
        throw httpError(401, "Jeton de mise à jour incorrect.");
      }
    },

    getStatus() {
      return status;
    },

    start() {
      if (status.state === "running") throw httpError(409, "Une mise à jour est déjà en cours.");
      status = freshStatus();
      status.state = "running";
      status.startedAt = new Date().toISOString();
      void execute();
      return status;
    },
  };
}

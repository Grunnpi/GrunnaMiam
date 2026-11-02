// Gestion des comptes en ligne de commande (création du premier administrateur, mot de passe oublié…).
// Fonctionne serveur allumé ou éteint.
//
//   node server/users-cli.mjs list
//   node server/users-cli.mjs add <nom> [admin|user]
//   node server/users-cli.mjs passwd <nom>
//
// Le mot de passe est demandé sans écho ; on peut aussi le passer par la variable GM_PASSWORD.
// Le dossier de données est celui du serveur : définissez DATA_DIR de la même façon que pour lui
// (sur le Synology : « . deploy/config.sh » avant de lancer la commande).

import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createAuth } from "./auth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const auth = createAuth({ dataDir: DATA_DIR });

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => process.stdout.write(text.includes(question) ? text : "*");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword() {
  if (process.env.GM_PASSWORD) return process.env.GM_PASSWORD;
  const first = await askHidden("Mot de passe : ");
  const second = await askHidden("Confirmez : ");
  if (first !== second) throw new Error("Les deux mots de passe sont différents.");
  return first;
}

function usage() {
  console.log("Usage :");
  console.log("  node server/users-cli.mjs list");
  console.log("  node server/users-cli.mjs add <nom> [admin|user]");
  console.log("  node server/users-cli.mjs passwd <nom>");
}

async function main() {
  const [command, username, role] = process.argv.slice(2);
  console.log(`Dossier de données : ${DATA_DIR}`);

  if (command === "list") {
    const users = await auth.listUsers();
    if (users.length === 0) console.log("Aucun compte.");
    else console.table(users.map(({ id, ...rest }) => rest));
  } else if (command === "add" && username) {
    const created = await auth.createUser({ username, password: await readPassword(), role });
    console.log(`Compte « ${created.username} » créé (${created.role}).`);
  } else if (command === "passwd" && username) {
    await auth.resetPasswordByName(username, await readPassword());
    console.log(`Mot de passe de « ${username} » modifié (ses sessions ouvertes sont fermées).`);
  } else {
    usage();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Erreur : ${error.message}`);
  process.exitCode = 1;
});

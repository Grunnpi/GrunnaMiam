# GrunnaMiam

Application web de recettes de cuisine : recherche par ingrédients (requis / optionnel / exclu), par tags et par titre, listes de préférences, photos par étape, import/export ZIP.

Les données sont stockées **sur le serveur** (pas dans le navigateur) et partagées entre tous les appareils. Les visiteurs sans compte consultent en **lecture seule** ; les utilisateurs identifiés ajoutent, modifient et suppriment des recettes.

- Front : React 19 + Vite + Tailwind, installable en PWA.
- Back : un petit serveur Node.js **sans aucune dépendance npm** (`server/`), qui sert le site compilé et l'API sur un seul port.
- Pas de Docker, pas de base de données externe : tout est dans un dossier `data/`.

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Démarrage rapide (poste de dev)](#démarrage-rapide-poste-de-dev)
3. [Comptes et droits](#comptes-et-droits)
4. [Installation sur un Synology](#installation-sur-un-synology)
5. [Mise à jour depuis l'application](#mise-à-jour-depuis-lapplication)
6. [Configuration](#configuration)
7. [Scripts et commandes](#scripts-et-commandes)
8. [Données et sauvegarde](#données-et-sauvegarde)
9. [API](#api)
10. [Structure du projet](#structure-du-projet)
11. [Dépannage](#dépannage)

## Fonctionnalités

| | Visiteur (sans compte) | Utilisateur | Administrateur |
|---|:-:|:-:|:-:|
| Consulter, rechercher, filtrer, voir les listes | ✅ | ✅ | ✅ |
| Exporter les recettes (ZIP) | ✅ | ✅ | ✅ |
| Créer / modifier / supprimer une recette | ❌ | ✅ | ✅ |
| Importer un ZIP, tout supprimer | ❌ | ✅ | ✅ |
| Créer, modifier, supprimer des listes | ❌ | ✅ | ✅ |
| Gérer les comptes | ❌ | ❌ | ✅ |
| Mettre à jour l'application | ❌ | ❌ | ✅ |

- **Recherche par titre** : insensible à la casse et aux accents ; tous les mots saisis doivent figurer dans le titre. Se combine avec les filtres ingrédients, tags et listes.
- **Header** : affiche la version, le commit git et l'heure de démarrage du serveur.
- **Suppression d'une recette** : bouton « Supprimer » sur la page de la recette, avec confirmation. Ses photos sont effacées du disque et elle est retirée des listes.

## Démarrage rapide (poste de dev)

Prérequis : Node.js récent (la version indiquée dans `.mise.toml` convient ; Vite 8 demande au minimum Node 20.19 ou 22.12).

```sh
npm install
npm run dev
```

Ouvrir http://localhost:8443. L'API est montée directement dans le serveur de dev : rien d'autre à lancer. Les données sont écrites dans `./data`.

Au tout premier lancement, l'application demande de **créer le compte administrateur**, puis charge 10 recettes d'exemple (supprimables avec *Gérer → Supprimer toutes les recettes*).

Tester comme en production :

```sh
npm run build
npm start          # http://localhost:3100
```

## Comptes et droits

- **Premier compte** : tant qu'aucun compte n'existe, l'application affiche « Créer le compte administrateur ». Pour ne pas laisser un autre visiteur vous devancer, créez-le immédiatement après un déploiement, ou en ligne de commande (voir plus bas).
- **Gestion** : bouton de compte dans le header (« Connexion », puis votre nom). Un administrateur y crée des comptes (rôle *Utilisateur* ou *Administrateur*), réinitialise des mots de passe et supprime des comptes. Chacun peut changer son propre mot de passe.
- **Mots de passe** : 8 caractères minimum, hachés avec scrypt (sel aléatoire par compte). Nom d'utilisateur : 3 à 32 caractères (lettres, chiffres, `.`, `-`, `_`), insensible à la casse.
- **Sessions** : cookie `HttpOnly` signé, valable 30 jours, indépendant de la mémoire du serveur : il survit aux redémarrages et aux mises à jour. Changer ou réinitialiser un mot de passe ferme les sessions ouvertes de ce compte. Le cookie est marqué `Secure` quand le site est servi en HTTPS (y compris derrière un proxy inversé qui envoie `X-Forwarded-Proto: https`).
- **Protections** : 10 échecs de connexion en 10 minutes bloquent temporairement l'adresse IP ; les écritures « inter-sites » sont refusées (`SameSite=Lax` + en-tête `Sec-Fetch-Site`).
- **Session expirée** : si une sauvegarde est refusée, l'interface repasse en lecture seule et un bandeau demande de se reconnecter ; les modifications locales sont alors envoyées automatiquement.

### Gérer les comptes en ligne de commande

Utile pour créer le premier administrateur ou récupérer un accès perdu. Fonctionne serveur allumé ou éteint.

```sh
node server/users-cli.mjs list
node server/users-cli.mjs add <nom> [admin|user]
node server/users-cli.mjs passwd <nom>
```

| Élément | Détail |
|---|---|
| Mot de passe | demandé sans écho (deux fois) ; ou variable `GM_PASSWORD` pour un usage non interactif |
| `DATA_DIR` | doit être le même que celui du serveur (sur le Synology : `. deploy/config.sh` avant la commande) |

## Installation sur un Synology

Le serveur n'a besoin ni de Docker ni de dépendances : seulement Node.js, git (pour la mise à jour depuis l'application) et un dossier.

1. **Node.js** : installez le paquet *Node.js* depuis le Centre de paquets (v20.19+ ou v22.12+ recommandée, nécessaire pour compiler avec Vite 8). Vérifiez avec `node -v` en SSH. À défaut, téléchargez le binaire Linux (x64 ou arm64) sur nodejs.org et renseignez `NODE_BIN` (voir [Configuration](#configuration)).
2. **Git** : installez le paquet *Git Server* (ou tout autre git disponible).
3. **Cloner** le dépôt, par exemple dans `/volume1/web/GrunnaMiam` :
   ```sh
   cd /volume1/web
   git clone <url-du-dépôt> GrunnaMiam
   cd GrunnaMiam
   npm ci
   npm run build
   ```
   Si le dépôt est privé, prévoyez une clé de déploiement ou un jeton dans l'URL du remote : `git pull` doit pouvoir s'exécuter sans saisie de mot de passe.
4. **Test manuel** : `node server/index.mjs`, puis ouvrir `http://IP-DU-NAS:3100` et créer l'administrateur. Arrêt avec Ctrl+C.
5. **Démarrage automatique** : *Panneau de configuration → Planificateur de tâches → Créer → Tâche déclenchée → Script défini par l'utilisateur*.
   - *Général* : nom libre, utilisateur `root` (ou un utilisateur ayant les droits sur le dossier), événement **Démarrage**, tâche activée.
   - *Paramètres de la tâche*, commande à exécuter :
     ```sh
     sh /volume1/web/GrunnaMiam/deploy/start-synology.sh
     ```
   Lancez-la avec « Exécuter » (sans attendre un redémarrage), puis testez un vrai redémarrage du NAS.
6. **Adresse propre en HTTPS (recommandé)** : *Panneau de configuration → Portail de connexion → Avancé → Proxy inversé* : source = votre nom d'hôte en HTTPS (443), destination = `localhost`, port `3100`. Le HTTPS est nécessaire pour installer l'application en PWA et pour que les mots de passe ne circulent pas en clair.

> ⚠️ **N'exposez pas le dossier du projet avec Web Station.** Web Station ne sait servir que des fichiers statiques (l'API n'existerait pas) et rendrait téléchargeables `data/` (recettes, comptes) et `.git/`. Le serveur Node ne sert que `dist/`.

### Ce que fait `deploy/start-synology.sh`

- Charge `deploy/config.sh` s'il existe (réglages locaux, non versionné).
- Détecte `node` (ajoute `/usr/local/bin` et `/usr/bin` au `PATH`, car le Planificateur de tâches n'a pas toujours le bon).
- Définit `GRUNNAMIAM_SUPERVISED=1` pour que le serveur sache qu'il sera relancé.
- Lance le serveur **en boucle** : s'il s'arrête (plantage, mise à jour), il est relancé 3 secondes plus tard.
- Écrit les journaux dans `logs/server.log` (archivé en `server.log.1` au-delà de 5 Mo).
- Quand vous arrêtez la tâche, il arrête proprement le serveur.

## Mise à jour depuis l'application

*Gérer → Mise à jour de l'application → Mettre à jour maintenant* (réservé aux administrateurs). Le serveur exécute :

1. `git pull --ff-only`
2. `npm ci --include=dev` — uniquement si `package-lock.json` a changé ou si `node_modules` est absent
3. `npm run build -- --outDir dist-next`, puis remplacement de `dist/` en une fois : le site reste en ligne pendant la compilation
4. redémarrage du serveur

L'écran affiche les étapes et le journal en direct, puis la page se recharge toute seule quand le serveur est revenu. S'il n'y a rien de nouveau (`git pull` ne ramène aucun commit), il n'y a ni compilation ni redémarrage : « Déjà à jour ».

Conditions : `git`, `node` et `npm` disponibles pour l'utilisateur qui lance le serveur, dépôt cloné (pas une simple copie de fichiers), `node_modules` installé au moins une fois, et lancement via `deploy/start-synology.sh` pour le redémarrage automatique. Sans cette boucle de relance (`npm start` à la main), la mise à jour est faite mais le message demande de redémarrer à la main.

Le bouton peut être désactivé avec `DISABLE_UPDATE=1`. Les données (`data/`) ne sont jamais touchées.

## Configuration

### Variables d'environnement du serveur (`server/index.mjs`)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3100` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface d'écoute (`127.0.0.1` pour n'accepter que le proxy inversé local) |
| `DATA_DIR` | `<projet>/data` | Dossier des données (recettes, images, comptes) |
| `DIST_DIR` | `<projet>/dist` | Dossier du site compilé |
| `DISABLE_UPDATE` | *(absent)* | `1` : désactive la mise à jour depuis l'application |
| `GRUNNAMIAM_SUPERVISED` | *(absent)* | `1` : le serveur est relancé par une boucle externe ; positionné automatiquement par `start-synology.sh` |

`DATA_DIR` est aussi pris en compte par `npm run dev` / `npm run preview` et par `server/users-cli.mjs`.

### Réglages locaux du Synology : `deploy/config.sh`

Ce fichier est **ignoré par git** (donc jamais écrasé par une mise à jour). Il est lu par `start-synology.sh`. Créez-le à partir du modèle :

```sh
cp deploy/config.example.sh deploy/config.sh
```

```sh
# export PORT=3100
# export DATA_DIR=/volume1/web/grunnamiam-data
# export NODE_BIN=/usr/local/bin/node
# export DISABLE_UPDATE=1
```

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (défaut du script : `3100`) |
| `DATA_DIR` | Déplacer les données hors du dossier de l'application |
| `NODE_BIN` | Chemin de `node` si la détection automatique échoue (binaire installé à la main) |
| `DISABLE_UPDATE` | `1` pour désactiver le bouton de mise à jour |

Après modification, arrêtez puis relancez la tâche du Planificateur.

## Scripts et commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev Vite (port 8443) avec l'API intégrée |
| `npm run build` | Compile le site dans `dist/` |
| `npm run preview` | Sert `dist/` avec Vite, API intégrée |
| `npm start` | Serveur de production (`node server/index.mjs`) : `dist/` + API sur le port 3100 |
| `npm run format` | Formatage du code (oxfmt) |
| `node server/users-cli.mjs …` | Gestion des comptes (voir [Comptes et droits](#comptes-et-droits)) |
| `sh deploy/start-synology.sh` | Lancement supervisé (relance automatique) pour le Synology |

## Données et sauvegarde

Tout est dans `data/` (ou `DATA_DIR`) :

| Fichier | Contenu |
|---|---|
| `db.json` | Recettes et listes de préférences |
| `db.json.bak` | Version précédente de `db.json` (copie avant chaque écriture) |
| `images/` | Photos des recettes, nommées par hash (`<sha1>.jpg`…), dédoublonnées ; les photos qui ne sont plus utilisées sont supprimées automatiquement |
| `users.json` | Comptes (mots de passe hachés) |
| `session.key` | Clé secrète de signature des sessions — **à ne jamais diffuser** ; la supprimer déconnecte tout le monde |

- **Sauvegarde** : copiez le dossier `data/` (Hyper Backup, copie planifiée…). L'export ZIP de l'application (*Gérer → Exporter*) contient les recettes, leurs images et les listes, mais pas les comptes.
- **Écriture atomique** : `db.json` est écrit dans un fichier temporaire puis renommé ; un `db.json` illisible n'est jamais écrasé (le serveur répond en erreur et le journal indique la cause) — restaurez alors `db.json.bak`.
- **Premier démarrage** : si `db.json` n'existe pas, les recettes d'exemple sont enregistrées à la première connexion d'un utilisateur.
- **Import ZIP** : *Gérer → Importer* — « Remplacer les recettes du même ID » ou « Ajouter comme nouvelles recettes ».

## API

Toutes les routes sont préfixées par `/api`, réponses en JSON.

| Méthode et route | Accès | Rôle |
|---|---|---|
| `GET /health` | public | Test de vie |
| `GET /info` | public | Version, commit, heure de démarrage |
| `GET /data` | public | Recettes et listes |
| `GET /images/<hash>.<ext>` | public | Photo d'une recette |
| `GET /auth/me` | public | Utilisateur courant, et si la création du premier compte est requise |
| `POST /auth/setup` | public, tant qu'aucun compte n'existe | Crée le premier administrateur |
| `POST /auth/login` · `POST /auth/logout` | public | Connexion / déconnexion |
| `POST /auth/password` | connecté | Change son mot de passe |
| `PUT /recipes/:id` | connecté | Crée ou remplace une recette (les images en `data:` sont enregistrées sur disque) |
| `POST /recipes/delete` | connecté | Supprime des recettes (`{ "ids": [...] }`) |
| `PUT /lists` | connecté | Remplace les listes de préférences |
| `GET /users` · `POST /users` | administrateur | Liste / crée des comptes |
| `DELETE /users/:id` · `POST /users/:id/password` | administrateur | Supprime un compte / réinitialise son mot de passe |
| `GET /update` · `POST /update` | administrateur | État / lancement de la mise à jour |

Limite de taille d'une requête : 40 Mo.

## Structure du projet

```
src/
  App.tsx            Application (liste, recherche, détail, formulaire, listes, import/export)
  api.ts             Appels à l'API + état de synchronisation
  auth.tsx           Session côté client, écran de création du premier administrateur
  UserMenu.tsx       Connexion, compte, gestion des utilisateurs
  UpdatePanel.tsx    Mise à jour depuis l'application
  VersionBadge.tsx   Version et heure de démarrage dans le header
  SyncStatus.tsx     Bandeau « Enregistrement… » / erreurs de sauvegarde
server/
  index.mjs          Serveur de production (site + API)
  api.mjs            Routes de l'API, stockage des recettes et des images
  auth.mjs           Comptes, mots de passe, sessions
  update.mjs         git pull + build + redémarrage
  users-cli.mjs      Gestion des comptes en ligne de commande
deploy/
  start-synology.sh  Lancement supervisé pour le Synology
  config.example.sh  Modèle de réglages locaux (à copier en config.sh)
public/              Manifest PWA, icônes, service worker
data/                Données (créé automatiquement, ignoré par git)
```

**Synchronisation côté client** : chaque modification est comparée au dernier état connu du serveur puis envoyée automatiquement (un bandeau signale les erreurs, avec « Réessayer »). Le service worker ne met jamais l'API en cache (seules les images, qui ne changent pas, le sont).

## Dépannage

| Symptôme | Piste |
|---|---|
| « Serveur injoignable » | Le serveur n'est pas démarré, ou le port est incorrect. Voir `logs/server.log`. |
| `EADDRINUSE` au démarrage | Le port est déjà pris : changez `PORT` ou arrêtez l'autre instance (ancien portail Web Station, ancienne tâche…). |
| Écran « Créer le compte administrateur » alors que vous avez déjà des comptes | `users.json` est introuvable : vérifiez `DATA_DIR` (le serveur et le script de comptes doivent utiliser le même). |
| Mot de passe administrateur perdu | `node server/users-cli.mjs passwd <nom>` en SSH. |
| La mise à jour échoue à l'étape `git pull` | Dépôt privé sans identifiants, ou git signale un « dubious ownership » : `git config --global --add safe.directory /volume1/web/GrunnaMiam`. |
| La mise à jour échoue à l'étape `npm` | Version de Node trop ancienne, ou pas d'accès réseau depuis le NAS. Le journal de l'étape s'affiche dans la fenêtre de mise à jour. |
| Le serveur ne redémarre pas après une mise à jour | Il n'a pas été lancé par `start-synology.sh` : redémarrez-le à la main. |
| « Session expirée » dans un bandeau | La session a été fermée (mot de passe changé, `session.key` supprimé, 30 jours écoulés) : reconnectez-vous, les modifications en attente sont alors envoyées. |
| Ancien contenu affiché après un déploiement | Rechargez la page : le service worker se met à jour au chargement suivant. |
| `data/db.json` illisible | Restaurez `data/db.json.bak` (ou une sauvegarde de `data/`). |

## Notes de sécurité

- Il n'y a pas de HTTPS intégré : en dehors d'un réseau de confiance, passez par un proxy inversé HTTPS.
- Tout utilisateur connecté peut modifier toutes les recettes (elles n'ont pas d'auteur).
- Les administrateurs peuvent exécuter `git pull` et une compilation sur le serveur : ne donnez ce rôle qu'à des personnes de confiance, et ne laissez pas le dépôt cloné pointer vers une source que vous ne maîtrisez pas.

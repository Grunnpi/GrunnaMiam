#!/bin/sh
# Lance GrunnaMiam et le relance automatiquement s'il s'arrête.
# Conçu pour être appelé par le Planificateur de tâches du Synology (déclencheur : démarrage).
#
# Réglages possibles (variables d'environnement, ou à modifier ci-dessous) :
#   PORT      port d'écoute (défaut 3100)
#   DATA_DIR  dossier des données (défaut : <app>/data)
#   NODE_BIN  chemin de node (défaut : détecté automatiquement)

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
cd "$APP_DIR" || exit 1

export PORT="${PORT:-3100}"

# Sur le Synology, node est généralement dans /usr/local/bin (le Planificateur n'a pas toujours le bon PATH).
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
if [ -z "$NODE_BIN" ]; then
  echo "node est introuvable : installez le paquet Node.js depuis le Centre de paquets." >&2
  exit 1
fi

mkdir -p "$APP_DIR/logs"
LOG="$APP_DIR/logs/server.log"

# Évite de garder un journal qui grossit indéfiniment (> 5 Mo : on garde l'ancien en .1)
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5242880 ]; then
  mv -f "$LOG" "$LOG.1"
fi

CHILD=""
trap 'echo "[$(date)] arrêt demandé" >> "$LOG"; [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null; exit 0' TERM INT

echo "[$(date)] démarrage avec $NODE_BIN ($("$NODE_BIN" --version))" >> "$LOG"
while true; do
  "$NODE_BIN" server/index.mjs >> "$LOG" 2>&1 &
  CHILD=$!
  wait "$CHILD"
  echo "[$(date)] le serveur s'est arrêté (code $?), relance dans 5 s" >> "$LOG"
  sleep 5
done

#!/bin/sh
# Lance GrunnaMiam et le relance automatiquement dès qu'il s'arrête
# (crash, ou redémarrage demandé par la mise à jour depuis l'application).
# Conçu pour être appelé par le Planificateur de tâches du Synology (déclencheur : démarrage).
#
# Réglages : créez deploy/config.sh (copie de config.example.sh, non versionné) plutôt que
# de modifier ce fichier, qui est mis à jour par git pull.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
cd "$APP_DIR" || exit 1

# Réglages locaux (PORT, DATA_DIR, NODE_BIN…)
[ -f "$APP_DIR/deploy/config.sh" ] && . "$APP_DIR/deploy/config.sh"

export PORT="${PORT:-3100}"
# Indique au serveur qu'une boucle de relance existe : il peut donc se terminer après une mise à jour.
export GRUNNAMIAM_SUPERVISED=1

# Sur le Synology, node et git sont généralement dans /usr/local/bin ou /usr/bin
# (le Planificateur de tâches n'a pas toujours le bon PATH).
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
# Si le serveur s'arrête aussitôt après son démarrage (port refusé, erreur de configuration…), le délai avant la relance
# double à chaque échec (3, 6, 12… puis 60 secondes maximum) au lieu de tourner en boucle toutes les 3 secondes.
DELAY=3
while true; do
  STARTED=$(date +%s)
  "$NODE_BIN" server/index.mjs >> "$LOG" 2>&1 &
  CHILD=$!
  wait "$CHILD"
  CODE=$?
  if [ $(( $(date +%s) - STARTED )) -ge 30 ]; then
    DELAY=3   # il a tourné normalement : on repart sur le délai de base
  fi
  echo "[$(date)] le serveur s'est arrêté (code $CODE), relance dans $DELAY s" >> "$LOG"
  sleep "$DELAY"
  if [ "$DELAY" -lt 60 ]; then
    DELAY=$(( DELAY * 2 ))
    [ "$DELAY" -gt 60 ] && DELAY=60
  fi
done

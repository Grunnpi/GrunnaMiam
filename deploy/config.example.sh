# Réglages locaux du serveur (facultatifs). À copier en deploy/config.sh (ce fichier n'est pas versionné) :
#   cp deploy/config.example.sh deploy/config.sh

# export PORT=3100
# export DATA_DIR=/volume1/web/grunnamiam-data
# export NODE_BIN=/usr/local/bin/node

# Désactive le bouton « Mettre à jour » de l'application (réservé aux administrateurs).
# export DISABLE_UPDATE=1

# ── Sessions (connexion des comptes) ────────────────────────────────────────
# Durée maximale d'une session, en jours (défaut : 7).
# export SESSION_DAYS=7
# Une session inactive depuis ce nombre d'heures est fermée (défaut : 48).
# export SESSION_IDLE_HOURS=48

# À activer SEULEMENT si le serveur est derrière un proxy inversé de confiance qui n'est pas sur la même machine
# (par exemple un autre serveur du réseau) : l'adresse IP des clients est alors lue dans X-Forwarded-For.
# Derrière le proxy inversé du DSM (même machine), ce n'est pas nécessaire.
# export TRUST_PROXY=1

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

# ── Blocage d'un compte après des échecs de connexion ─────────────────────────────────────────────────
# (en plus de la limite par adresse IP). Après N échecs, le compte est bloqué 30 s, puis le délai double à chaque échec
# (1 min, 2 min, 4 min…) jusqu'au maximum ; une connexion réussie remet le compteur à zéro.
# export LOGIN_FREE_ATTEMPTS=4      # échecs tolérés avant le premier blocage (défaut : 4)
# export LOGIN_LOCK_SECONDS=30      # durée du premier blocage, en secondes (défaut : 30)
# export LOGIN_LOCK_MAX_MINUTES=15  # durée maximale d'un blocage, en minutes (défaut : 15)

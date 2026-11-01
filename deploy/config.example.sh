# Réglages locaux du serveur. À copier en deploy/config.sh (ce fichier n'est pas versionné) puis à adapter :
#   cp deploy/config.example.sh deploy/config.sh
#   chmod 600 deploy/config.sh

# Jeton qui active (et protège) le bouton « Mettre à jour » de l'application.
# Choisissez une longue valeur aléatoire, par exemple avec :  head -c 24 /dev/urandom | base64
# Sans cette ligne, la mise à jour depuis l'application est désactivée.
export UPDATE_TOKEN="remplacez-moi-par-une-longue-valeur-aleatoire"

# Autres réglages possibles
# export PORT=3100
# export DATA_DIR=/volume1/web/grunnamiam-data
# export NODE_BIN=/usr/local/bin/node

#!/usr/bin/env bash
# Instala (o actualiza) el Kino Receptor en una TV LG con Developer Mode. Necesita Node.js.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ipk="kino-receptor-lg.ipk"

command -v node >/dev/null || { echo "Falta Node.js: https://nodejs.org"; exit 1; }
command -v ares-install >/dev/null || npm i -g @webos-tools/cli

read -r -p "IP de la TV (Ajustes > Red): " ip
ares-setup-device --add lg -i "host=$ip" -i "port=9922" -i "username=prisoner" 2>/dev/null \
  || ares-setup-device --modify lg -i "host=$ip" -i "port=9922" -i "username=prisoner"
echo "Escribe la clave (passphrase) que muestra la app Developer Mode en la TV:"
ares-novacom --device lg --getkey
ares-install --device lg "$ipk"
echo "Listo. En Kino, envia algo a la TV y acepta el aviso con el control remoto."

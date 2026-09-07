#!/usr/bin/env bash
# Recrea los atajos de `user-data/`: los symlinks a las carpetas donde Kex escribe DE VERDAD
# en la máquina. Idempotente, se puede ejecutar tantas veces como se quiera.
#
# Existe para no tener que acordarse de si algo vive en `~/Library/Logs`, en
# `~/Library/Application Support` (con el identificador de Tauri por nombre), en `~/.config` o
# en `~/.cache`. La tabla de qué es cada enlace, y de lo que NO se enlaza y por qué, está en
# `CLAUDE.md`. Es el mismo patrón que llevan Yottacast y el software de Hub.
#
# De esta carpeta solo el script entra en git: los enlaces son de ESTA máquina, y el
# `.gitignore` los ignora con una excepción para él. Sin versionarlo, un clon nuevo se queda
# sin la carpeta y sin forma de rehacerla.
set -euo pipefail
aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# `rm -rf` antes de enlazar, y nunca `ln -sf`: sobre un enlace que YA apunta a un directorio,
# `ln -sf` no lo reemplaza, crea otro enlace DENTRO de él (`user-data/logs/app.betauer.kex`).
#
# Y antes de borrar, la guardia: si lo que hay con ese nombre existe y NO es un symlink, se
# aborta, porque un `rm -rf` sobre un directorio de verdad convierte un despiste en pérdida de
# datos.
enlazar() {
  local destino="$1" enlace="$2"
  if [ -e "$enlace" ] && [ ! -L "$enlace" ]; then
    echo "ABORTA: $enlace existe y no es un symlink, así que no lo borro." >&2
    echo "Mira qué hay dentro y quítalo tú si de verdad no hace falta." >&2
    exit 1
  fi
  rm -rf "$enlace"
  ln -s "$destino" "$enlace"
}

# Las carpetas destino NO se crean a propósito: si una no existe, su enlace queda colgando, y
# eso es información (Kex todavía no ha escrito ahí en esta máquina).
#
# El identificador `app.betauer.kex` es el `identifier` de `src-tauri/tauri.conf.json`, y es
# Tauri quien nombra con él las dos carpetas del sistema. Si algún día cambia ahí, cambia aquí.
enlazar "$HOME/Library/Logs/app.betauer.kex" "$aqui/logs"
enlazar "$HOME/Library/Application Support/app.betauer.kex" "$aqui/support"
enlazar "$HOME/.config/kex" "$aqui/config"
enlazar "$HOME/.cache/kex" "$aqui/cache"

echo "enlaces de $aqui:"
ls -la "$aqui" | grep -- '->' || echo "  (ninguno, y eso es un fallo: mira los avisos de arriba)"

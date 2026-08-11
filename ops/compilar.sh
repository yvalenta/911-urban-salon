#!/bin/bash
# Compila el JSX de src/ a JS plano y lo inyecta en los HTML publicados.
#
# Por qué existe: la página cargaba Babel standalone (3,1 MB) y compilaba el
# JSX en el navegador EN CADA VISITA — 1-2 s de hilo principal en un celular
# medio. Compilar una vez aquí y publicar el resultado deja el mismo sitio
# estático sin build en el hosting, pero ultra liviano para el visitante.
#
# Flujo de edición desde ahora:
#   1. Editar src/landing.jsx o src/panel.jsx (los HTML ya no llevan JSX)
#   2. ops/compilar.sh
#   3. Probar, commit y push
set -euo pipefail
cd "$(dirname "$0")/.."

compilar() {
  local fuente="$1" html="$2" marcador="$3"
  # Los paquetes viven en devDependencies (npm install una vez); el sitio
  # publicado no usa node — esto corre solo en la máquina de quien edita.
  ./node_modules/.bin/babel "$fuente" --presets @babel/preset-react \
    -o "/tmp/911_compilado.js" --compact false
  # El JS no puede contener "</script>" o partiría el HTML al inyectarlo.
  if grep -q '</script' /tmp/911_compilado.js; then
    echo "ERROR: el compilado de $fuente contiene '</script>'"; exit 1
  fi
  python3 - "$html" "$marcador" <<'PY'
import re, sys
html, marcador = sys.argv[1], sys.argv[2]
js = open("/tmp/911_compilado.js").read()
s = open(html).read()
nuevo = f'<script id="{marcador}">\n/* Compilado de src/ por ops/compilar.sh — NO editar aquí */\n{js}\n</script>'
s, n = re.subn(r'<script id="' + marcador + r'">.*?</script>', lambda _: nuevo, s, count=1, flags=re.DOTALL)
assert n == 1, f"marcador {marcador} no encontrado en {html}"
open(html, "w").write(s)
print(f"{html}: {len(js)} bytes inyectados en #{marcador}")
PY
}

compilar src/landing.jsx index.html app-landing
compilar src/panel.jsx admin/index.html app-panel
echo "listo — recuerda probar ambas páginas antes de commitear"

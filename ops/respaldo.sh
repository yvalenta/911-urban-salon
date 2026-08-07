#!/bin/bash
# Respaldo diario de la base del salón (turnos, ventas, productos, contenido).
#
# CSV por tabla vía psql y NO pg_dump, a propósito: el pg_dump local es v13 y
# el servidor de Supabase es v17 — pg_dump aborta por la diferencia de versión,
# y un respaldo que depende de qué versión haya instalada es un respaldo que un
# día deja de correr. psql \copy funciona contra cualquier versión. El ESQUEMA
# no se respalda aquí porque ya está versionado en db/*.sql; esto guarda los
# DATOS, que son lo irrecuperable (el plan gratuito de Supabase no tiene
# backups automáticos).
#
# Restaurar una tabla: aplicar db/*.sql y luego
#   psql "$DATABASE_URL" -c "\copy public.turnos from 'turnos.csv' csv header"
#
# Corre a diario vía launchd (~/Library/LaunchAgents/codes.ynt.911urban.respaldo.plist);
# a mano: ops/respaldo.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO_BASE="$HOME/Respaldos/911urban"
DESTINO="$DESTINO_BASE/$(date +%F_%H%M)"
RETENCION_DIAS=60

# shellcheck source=/dev/null
source "$REPO/.env"

mkdir -p "$DESTINO"
for tabla in turnos ventas productos negocio servicios; do
  psql "$DATABASE_URL" -qc "\copy (select * from public.$tabla) to '$DESTINO/$tabla.csv' csv header"
done

# La fila de control dice cuándo y cuánto: un respaldo vacío que no se nota es
# peor que no tener respaldo, porque tranquiliza.
wc -l "$DESTINO"/*.csv > "$DESTINO/resumen.txt"
echo "respaldo ok: $DESTINO"

# Retención: los directorios viejos se van solos.
find "$DESTINO_BASE" -maxdepth 1 -type d -mtime "+$RETENCION_DIAS" -exec rm -rf {} +

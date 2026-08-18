# 911urban en la constelación

Declaración de este repo para el grafo de proyectos de la casa (lo lee
el observatorio interno de la casa, que documenta el formato). Repo público:
solo superficies públicas.

| campo | valor |
|---|---|
| id | 911urban |
| clase | app |
| qué | landing + panel de turnos de la barbería (tenant aparte) |
| dónde | GitHub Pages (`911-urban-salon.ynt.codes`); respaldo por launchd en la Mac |
| servicio | `—` (LaunchAgent `codes.ynt.911urban.respaldo` en la Mac) |
| atiende | sesiones de Claude a demanda |
| contexto | `README.md` |
| visibilidad | público: `github:yvalenta/911-urban-salon` |

## Aristas

| a | b | tipo | por | medición |
|---|---|---|---|---|
| 911urban | github | publica | Pages → `https://911-urban-salon.ynt.codes/` | `http https://911-urban-salon.ynt.codes/ 200` |
| 911urban | supabase | consume | turnos y auth | `—` |
| mac | 911urban | respalda | `ops/respaldo.sh` por launchd | `launchd mac codes.ynt.911urban.respaldo` |

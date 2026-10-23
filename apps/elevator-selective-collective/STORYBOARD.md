# Storyboard — elevator selective vs down collective (~84s)

| Scene | Presentation time | Simulation |
| --- | --- | --- |
| Title | 0–4s | Opening card; dim plate, car at rest |
| 0 Terms | 4–14s | Static lobby; glossary + riders A–D |
| 1 Down collective | 14–44s | Full sim 0–36s (compressed) |
| 2 Selective collective | 44–66s | Full sim 0–25s (compressed) |
| 3 Stats | 66–84s | Mean wait/journey + per-rider table |

## Key stills (`npm run snapshot:stills`)

| Time | Moment |
| --- | --- |
| 2s | Title card (mid) |
| 9s | Terms + call bubbles |
| 18.2s | Down collective going up; B/C waiting |
| 23.2s | Down collective at 9F (turn) |
| 30.1s | Down collective at 4F; B boards |
| 38.6s | Down collective second up trip |
| 48s | Selective at 4F; B boards |
| 52.6s | Selective at 7F; B off / C on |
| 57.2s | Selective down at 8F; D boards |
| 74s | Comparison stats |

Animation reads `composition/simulation.js` (segments + events), not hard-coded stop times.

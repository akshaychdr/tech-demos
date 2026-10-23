# Storyboard — elevator selective vs down collective (~80s)

| Scene | Presentation time | Simulation |
| --- | --- | --- |
| 0 Terms | 0–10s | Static lobby; glossary + riders A–D |
| 1 Down collective | 10–40s | Full sim 0–36s (compressed) |
| 2 Selective collective | 40–62s | Full sim 0–25s (compressed) |
| 3 Stats | 62–80s | Mean wait/journey + per-rider table |

## Key stills (`npm run snapshot:stills`)

| Time | Moment |
| --- | --- |
| 5s | Terms + call bubbles |
| 14.2s | Down collective going up; B/C waiting |
| 19.2s | Down collective at 9F (turn) |
| 25.8s | Down collective at 4F; B boards |
| 34.6s | Down collective second up trip |
| 44s | Selective at 4F; B boards |
| 48.6s | Selective at 7F; B off / C on |
| 53.2s | Selective down at 8F; D boards |
| 70s | Comparison stats |

Animation reads `composition/simulation.js` (segments + events), not hard-coded stop times.

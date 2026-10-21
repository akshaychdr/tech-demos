# Selective collective (LOOK) vs down collective — storyboard

Target reel: **~38 s** @ **1920×1080**, **60 fps**.  
Terminology: Gina Barney, *The History of Lift Traffic Control*; Harris elevator terms.

## Scenario (identical for both controls)

| Passenger | Request @ t=0 | Notes |
|-----------|---------------|--------|
| Lobby rider | 1F → 9F | Boards at start |
| Interfloor rider | 4F → 7F (up) | Waiting at 4F |
| Down rider | 8F → 1F | Down request at 8F |

Physics: **1.0 s/floor**, **1.5 s dwell** after each stop, car starts **1F**.

**Wait** = registration → car arrives at your floor (excludes dwell).  
**Journey** = registration → arrival at destination (includes dwell at stops).

### Simulation results (from `composition/simulation.js`)

| Passenger | Down collective wait | Down journey | Selective wait | Selective journey |
|-----------|---------------------|--------------|----------------|-------------------|
| Lobby → 9F | 0.0 s | 9.5 s | 0.0 s | 12.5 s |
| 4F → 7F (up) | 17.5 s | 29.5 s | 4.5 s | 9.0 s |
| 8F → 1F (down) | 12.0 s | 22.0 s | 15.0 s | 23.5 s |
| **Mean** | **9.8 s** | **20.3 s** | **6.5 s** | **15.0 s** |

Down collective: while travelling **up**, only **car calls** stop the car — 4F rider is **passed**.  
Selective collective (LOOK): **up** landing call at 4F is served on the ascent.

## Scenes

| # | Time | Copy | Still |
|---|------|------|-------|
| 1 Hook | 0–6 s | “Going up?” / “I'll grab you on the way.” | @ 3 s |
| 2 Down collective | 6–14 s | Explains up-distributive / down-collective | @ 10 s |
| 3 Selective collective | 14–28 s | LOOK / directional collective | @ 20 s |
| 4 Stats | 28–38 s | Mean wait + mean journey bars | @ 34 s |

Stills: `bun run snapshot:stills` → `storyboard-stills/frame-00-at-3s.png` … `frame-03-at-34s.png`.

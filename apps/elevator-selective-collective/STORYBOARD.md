# Selective collective (SCAN) — storyboard

Target reel: **~38 s** @ **1920×1080**, **60 fps**, HyperFrames + GSAP.  
Mood: night glass tower, navy + cyan shaft/car, magenta hall calls, city bokeh, kinetic sans type.

Fixed scenario (same call list for both policies):

| # | Floor | Direction | Registered at (s) |
|---|-------|-----------|-------------------|
| 1 | 9     | up        | 0                 |
| 2 | 4     | up        | 0                 |
| 3 | 7     | up        | 0                 |

(FCFS serves registration order 9 → 4 → 7; SCAN serves 4 → 7 → 9 while ascending.)

Car starts at **1F**, idle, doors closed. **No destination dispatch.**  
Simulation: 1.0 s per floor travel, 1.5 s dwell per stop (labeled on-screen).

---

## Scene 1 — Hook (0:00–0:06, 6 s)

**Idea:** Establish premium night tower; kinetic headline sells the product story.

| | |
|---|---|
| **On-screen text** | “Going up?” (large) → “I'll grab you on the way.” (sub, staggered) |
| **Motion** | Bokeh drift; tower cross-section fades up with slight camera push (scale 1 → 1.04); headline words stagger in with `back.out(1.4)`; cyan shaft pulses once |
| **Duration** | 6 s |

**Still frame A @ 3.0 s** — headline fully visible, tower lit, no call paths yet.

---

## Scene 2 — Naive FCFS (0:06–0:14, 8 s)

**Idea:** Same three up-calls; car chases registration order (4 → 7 → 9) with wasteful reversals.

| | |
|---|---|
| **On-screen text** | “First-come-first-served” + “Chases calls in arrival order — extra reversals.” |
| **Motion** | Magenta call badges pop on 4F, 7F, 9F; orange dashed path shows actual FCFS route; car moves with ease-in-out + slight overshoot at each stop; floor labels tick |
| **Duration** | 8 s |

**Still frame B @ 10.0 s** — car at 7F mid-FCFS, orange path visible, caption legible.

---

## Scene 3 — Selective collective / SCAN (0:14–0:28, 14 s)

**Idea:** Directional collective serves all **up** calls while ascending, then reverses only when the shaft is clear ahead.

| | |
|---|---|
| **On-screen text** | “Selective collective (SCAN)” + “Every up call on the way up — then reverse.” |
| **Motion** | Reset car to 1F; magenta calls re-ignite; cyan dotted path animates 1→4→7→9 in one sweep; car follows with glow trail; micro push-in as car passes 7F |
| **Duration** | 14 s |

**Still frame C @ 20.0 s** — car between 7F–8F, cyan stop-order path, three magenta calls, subhead visible.

---

## Scene 4 — Honest simulation (0:28–0:38, 10 s)

**Idea:** Bar comparison of **mean wait time** from the same discrete-event simulation (not hand-waved).

| | |
|---|---|
| **On-screen text** | “Same calls · same speed · same dwell” + numeric means + “Simplified model — one car, hall calls only.” |
| **Motion** | Bars grow with stagger; FCFS vs SCAN labels; subtle camera settle; fade to logo line “HyperFrames × selective collective” |
| **Duration** | 10 s |

**Still frame D @ 34.0 s** — both bars visible with final wait-time values.

---

## Phase 1 deliverable

Four PNG stills from `hyperframes snapshot` at **3.0, 10.0, 20.0, 34.0 s** stored in `storyboard-stills/`.

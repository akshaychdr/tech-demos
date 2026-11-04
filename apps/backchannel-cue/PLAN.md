# Wall vs Listener

## Goal

A single-user, fully local demo of [KoljaB/backchannel-cue-32m](https://huggingface.co/KoljaB/backchannel-cue-32m): one avatar stays silent at pauses, the other backchannels from the model's cue.

## MVP

- Desktop and mobile stage with two avatars (Wall and Listener), a live decision panel, and a settings drawer.
- Listen mode: mic → Silero VAD pause (~0.45 s) → Moonshine-tiny transcript → fp32 ONNX cue → pre-rendered clip on the listener only.
- Story Replay: five scripted monologues with timestamped words and committed speaker audio, run through the same policy on a story clock (no mic, deterministic).
- Model fetched from Hugging Face and stored in the Cache API, with a progress bar. Tokenizer and `meta.json` ship with the app (MIT).
- Policy is a TypeScript port of `example.py` plus the prototype fixes below. A Python reference and a Vitest parity test share the prototype sentence scores.

## Out of scope

- Int8 weights, WebGPU, Web Speech API, server inference, a full assistant reply after the turn ends, accounts, workflow edits.

## Policy

Defaults (all visible in the drawer): clause-end gate **0.10** (card uses 0.09), mid-sentence gate **0.018**, echo **0.7**, spacing **6 s**, **4** cues / 60 s, block laugh/praise/wow when `bad > 0.3`.

Order, after `clean()` and `score()` copied from `example.py`:

1. Echo only for a hanging last word, not after `NOT_HANGING_AFTER`, echo ≥ 0.7, and not a filler `like` (previous word in was/is/were/am/are/be/been/just/so/really/kinda/sorta/literally/actually/you-know).
2. Stay quiet on a direct question (leading who/what/why/which, or `can you` / `do you` / `do you know` and the same auxiliary-you pattern).
3. Gate against the clause-end or mid-sentence bar.
4. Mid-sentence wording is only `mhm` / `yeah` / `uh-huh` (argmax). Clause-end wording is argmax too: among reactions that clear their bars and the mood filters, pick the strongest reaction other than `continuer` when one exists (`continuer` saturates near 1.0 and would hide "oh no"), otherwise `continuer`; then argmax that reaction's forms. No random sampling.
5. Spacing and the per-minute cap suppress a cue but still report the candidate and which rule blocked it.

## Stack

- Vite + React + TypeScript — requested; `base` is `/tech-demos/backchannel-cue/`.
- Tailwind + shadcn/ui (minimalist) — repo standard for the drawer, sliders, and buttons.
- Framer Motion — avatar and panel motion.
- `onnxruntime-web@1.31.1` WASM, one thread — fp32 CPU in the browser, no COOP/COEP.
- `tokenizers-wasm` — same encode as the Python `tokenizers` library.
- `@huggingface/transformers` Moonshine-tiny in a worker — local STT.
- `@ricky0123/vad-web` Silero v5 — frame-level pause detection on the mic.
- Piper (`en_US-lessac-medium` listener, `en_US-ryan-medium` stories) → Opus — committed clips, no runtime TTS.
- Vitest — policy parity only. Playwright — replay recording.

## Tasks

1. Scaffold, shadcn, bunfig.
2. Dump prototype scores; lock the policy; Python vs TS parity test.
3. Render cue clips and five stories.
4. Replay stage end to end (first working slice).
5. Listen mode (VAD, Moonshine, same panel).
6. Visual pass, screenshot, Playwright video, PR.

## Deferred

- Streaming partial transcripts, user-authored stories, WebGPU, int8. Replay does not need them, and live mode only needs an utterance transcript at the pause.

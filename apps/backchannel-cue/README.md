# Wall vs Listener

A local demo of [KoljaB/backchannel-cue-32m](https://huggingface.co/KoljaB/backchannel-cue-32m). Two avatars hear the same words. The wall stays silent. The listener backchannels at pauses — “mhm”, “oh no”, “about what?” — from the fp32 ONNX model running in the browser.

Nothing is uploaded. The model is fetched from Hugging Face once and kept in the Cache API. Speech-to-text is Moonshine-tiny in a worker. Pauses come from Silero VAD. Reaction clips and the story narration were rendered offline with Piper.

## Run

```bash
bun install
bun run dev
```

Open the printed URL with the `/tech-demos/backchannel-cue/` base. The first visit downloads about 129 MB.

Story Replay needs no microphone. It plays five scripted monologues through the same policy, on a story clock, so the cues are deterministic.

## Test

```bash
bun run test
```

That runs the Python reference (`scripts/policy_ref.py`) against the TypeScript policy on the prototype sentences.

# She answers the pauses

A local demo of [KoljaB/backchannel-cue-32m](https://huggingface.co/KoljaB/backchannel-cue-32m). Press Play: one story, about a minute and a quarter, is narrated out loud. At the pauses a second voice backchannels from the fp32 model running in the browser.

Nothing is uploaded. The model is fetched from Hugging Face once and kept in the Cache API. Narration and replies were rendered offline with Piper, in two different voices. A microphone path is behind the small link at the bottom.

## Run

```bash
bun install
bun run dev
```

Open the printed URL with the `/tech-demos/backchannel-cue/` base. The first visit downloads about 129 MB. Press Play to hear the story and the replies.

## Test

```bash
bun run test
```

That runs the Python reference (`scripts/policy_ref.py`) against the TypeScript policy on the prototype sentences.

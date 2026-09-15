# Fireflies Clone

A working clone of [Fireflies.ai](https://fireflies.ai) — record a meeting in the browser, get a
real diarized transcript, AI-generated notes and action items, conversation analytics, and a chat
assistant grounded in what was actually said.

This is not a mockup. Audio capture, speech-to-text, summarization, search and sharing are all
real. The one deliberately simulated piece is the meeting-joining **bot**, and it is labelled as
such in the UI (see [What's real vs. simulated](#whats-real-vs-simulated)).

---

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL and AUTH_SECRET
pnpm db:push                      # create the schema
pnpm db:seed                      # three fully-transcribed sample meetings
pnpm dev                          # http://localhost:3000
```

Sign in with the **Continue as Demo User** button — no OAuth setup required.

You need Postgres. Either use one you already have, or:

```bash
pnpm db:up        # docker compose: Postgres on :5433
# then DATABASE_URL=postgresql://fireflies:fireflies@localhost:5433/fireflies
```

Generate a secret with `openssl rand -base64 32`.

### Running with no API keys at all

The app is designed to degrade rather than break. With only `DATABASE_URL` and `AUTH_SECRET` set,
every screen works: recording really captures audio, but the transcript comes from a bundled
script and notes come from a keyword-based summarizer. **Settings → Service status** shows exactly
which parts are live and which are falling back.

---

## What it does

| Screen | What's there |
|---|---|
| **Home** | Quick capture actions, recent meetings, open tasks, AI feed of takeaways |
| **Meetings** (Notebook) | Channel sidebar, day-grouped list, filters (host, participant, date, duration, source), multi-select with bulk move/delete, ⌘K search |
| **Notepad** | The main screen — synced player + transcript + notes, detailed below |
| **Tasks** | Every action item across meetings, grouped by meeting, with assignee and due date |
| **Search** | Postgres full-text search over every sentence, plus one-click filters for tasks / questions / metrics / pricing / dates across the workspace |
| **AskFred** | Streaming chat across all meetings; finds relevant transcripts first, then answers from them |
| **Analytics** | Workspace talk-time leaderboard, meetings per week, sentiment |
| **Settings** | Workspace defaults, custom vocabulary (fed to the speech model), live service status |
| **/share/[token]** | Public, unauthenticated read-only recap with optional expiry |

### The Notepad

Three zones, matching the real product:

- **Icon rail** — Smart Search, Index (chapters + action moments), Soundbites, Comments, Bookmarks
- **Centre** — tabs for **Notes** / **Analytics** / **AskFred**. Notes carry a template dropdown
  (General, Sales/BANT, 1:1, Interview, Standup) that regenerates the whole summary in that style,
  plus keywords, key takeaways, overview, clickable chapters, and action items.
- **Transcript** — speaker-grouped, timestamped, click-to-seek, auto-scrolling with playback.
  Inline edit mode with autosave, find-in-transcript, and speaker rename that applies everywhere.
  **AI filter chips** (Tasks / Questions / Metrics / Pricing / Dates) highlight or isolate matching
  sentences.
- **Player** — waveform (wavesurfer.js) with chapter, comment, bookmark and soundbite markers,
  ±15s, speed control. Select transcript text to clip a shareable **soundbite**.

AskFred answers cite timestamps as `[t=mm:ss]`; those render as chips that seek the player.

---

## Architecture

**One Next.js app.** No separate backend, no WebSocket server, no Redis, no queue service.

```
Next.js 16 (App Router, RSC)  ·  Postgres + Drizzle  ·  Auth.js v5
Deepgram Nova-3 (STT)         ·  Claude / any OpenAI-compatible model (notes, AskFred)
Vercel Blob or local disk     ·  Tailwind v4 + Radix
```

### Live transcription without a WebSocket server

Serverless functions can't hold a socket open. So the audio is never proxied: the server mints a
short-lived Deepgram JWT (`POST /v1/auth/grant`), and the **browser connects to Deepgram
directly** over `wss://`. Our API key never reaches the client and no long-lived process is
needed. Finalized sentences batch-POST back every ~3s.

> If the Deepgram key lacks Member scope, `auth/grant` is forbidden. The recorder detects this,
> warns, and keeps recording — the transcript is then produced by batch transcription when you
> stop. Nothing is lost.

### Long-running work without a queue

Transcribing an hour of audio outlives a request. Instead of adding infrastructure:

```
upload → blob storage
       → Deepgram with callback_url  (Deepgram retries our webhook for up to 24h)
       → webhook writes sentences, enqueues `summarize`
       → after() drains the job queue in the same invocation
       → /api/cron/sweep (every 2 min) retries anything stuck or orphaned
```

Jobs live in a `jobs` table keyed uniquely on `(meeting_id, step)`, so webhook retries, cron
overlap and manual re-runs are all idempotent. Jobs that fail are retried 3× with backoff before
the meeting is marked failed.

**Locally**, neither Deepgram callbacks nor Blob's `onUploadCompleted` can reach `localhost`, so
`lib/stt/pipeline.ts` transparently switches to synchronous transcription (posting audio bytes
directly). Same code path, no tunnel needed — which matters because you will run this on a laptop.

### Data model

`src/db/schema.ts` deliberately mirrors [Fireflies' public GraphQL
schema](https://docs.fireflies.ai/graphql-api/query/transcript) so the mapping is obvious:
`sentences` carry `speaker_name`, `start_ms`, word-level timings and an **`ai_filters`** object
(`task`, `question`, `metric`, `pricing`, `date_and_time`, `sentiment`) per sentence — that field
is what powers Smart Search in the real product. `summaries` has one column per Fireflies summary
field (`keywords`, `action_items`, `outline`, `shorthand_bullet`, `overview`, `bullet_gist`,
`gist`, `short_summary`, `meeting_type`, `topics_discussed`).

### AI pipeline

After transcription, two calls run with **structured output** (JSON schema enforced, no parsing
defence needed):

1. **summarize** — every summary field in one pass, chapters anchored to real timestamps.
2. **classify** — returns the sentence *indices* matching each filter category. Returning indices
   rather than echoing text keeps output tokens small.

**Analytics are computed in TypeScript, not by the model** — talk time, words per minute, filler
words, longest monologue and question counts are arithmetic over word timings. Cheaper, instant,
and exactly right where a model would approximate.

The transcript is sent as a cached prefix so follow-up AskFred turns are cheap.

---

## Configuration

Only two variables are required. Everything else unlocks a capability and degrades cleanly.

| Variable | Effect if unset |
|---|---|
| `DATABASE_URL` | **Required** |
| `AUTH_SECRET` | **Required** (`openssl rand -base64 32`) |
| `DEEPGRAM_API_KEY` | Transcripts come from a bundled script instead of your audio |
| `ANTHROPIC_API_KEY` *or* `LLM_API_KEY`+`LLM_BASE_URL`+`LLM_MODEL` | Notes fall back to a keyword summarizer |
| `BLOB_READ_WRITE_TOKEN` | Media is stored on local disk under `.data/media` |
| `RECALL_API_KEY` / `RECALL_REGION` | "Add to live meeting" runs the simulated bot instead of a real one |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Demo login only |
| `PUBLIC_BASE_URL` | Defaults to localhost → synchronous transcription |
| `INTERNAL_JOB_SECRET` | Guards `/api/jobs/run` and `/api/cron/sweep` |
| `DEMO_MODE=true` | Forces scripted mode even with keys present |

### Language model

The LLM layer is provider-agnostic (`src/lib/ai/provider.ts`). Use Anthropic, or **any
OpenAI-compatible endpoint** including free tiers:

```bash
# Groq — free tier, no card
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...

# Google Gemini — free tier, no card
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-2.5-flash
LLM_API_KEY=...

# Ollama — fully local
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1:8b
LLM_API_KEY=ollama
```

`ANTHROPIC_API_KEY` wins when both are set. Structured output uses `json_schema` and falls back to
`json_object` + schema-in-prompt for models that don't support it.

---

## Deploying

```bash
vercel deploy
```

1. Create a Postgres database ([Neon](https://neon.tech) free tier works) → set `DATABASE_URL`.
2. Add a Vercel Blob store → `BLOB_READ_WRITE_TOKEN` is injected automatically.
3. Set `AUTH_SECRET`, `INTERNAL_JOB_SECRET`, `PUBLIC_BASE_URL` (your production URL), and your
   vendor keys.
4. Run `pnpm db:push` against the production `DATABASE_URL` once.

`vercel.json` registers the cron sweeper and raises `maxDuration` on the long routes. Deepgram
callbacks and async transcription switch on automatically once `PUBLIC_BASE_URL` is a public
https URL.

`GET /api/health` reports what's live — useful as an uptime check.

Nothing is Vercel-specific except Blob (which falls back to disk), so it also runs on Railway,
Render or Fly from the same codebase.

---

## What's real vs. simulated

| Capability | Status |
|---|---|
| Browser audio capture (mic + tab audio, mixed via Web Audio) | **Real** |
| Live streaming transcription | **Real**, when the Deepgram key has Member scope |
| Batch transcription with speaker diarization | **Real** |
| Sentence segmentation, word-level timings | **Real** |
| Summary, chapters, action items, sentence labelling | **Real** LLM output (keyword fallback without a key) |
| AskFred, per-meeting and workspace-wide | **Real**, streaming, with timestamp citations |
| Talk time, WPM, filler words, monologues, sentiment | **Real**, computed from word timings |
| Full-text search across transcripts | **Real** Postgres FTS with a GIN index |
| Public share links, soundbites, comments, bookmarks, exports | **Real** |
| **Notetaker bot joining a Zoom/Meet/Teams call** | **Real** via Recall.ai, or simulated without a key |

### The notetaker bot

Set `RECALL_API_KEY` and a **real bot joins the call** — it appears as a participant, waits for
admission, records, and hands back an MP3 that feeds the same Deepgram pipeline as everything
else. [Recall.ai](https://www.recall.ai/pricing) is $0.50/hr with the first 5 hours free.

Building this from scratch is not a weekend job: there is no join-a-meeting API, so you drive
headless Chrome per call, terminate WebRTC to get clean audio, reimplement it per platform, and
keep up with Google's UI changes forever — at ~2GB RAM per concurrent call. Buying it is the
right call; the integration below is ~200 lines.

Without the key the same flow runs as a **simulation** — the state machine, timings, live UI
updates and downstream pipeline are all real, only the audio is a sample. The dialog states which
mode it is in.

**Progress is driven by polling, not webhooks**, so it works locally with no tunnel: the `bot` job
re-enqueues itself every 5s until the call ends. A dev job runner (`src/instrumentation.ts`) ticks
the queue every 3s in development; production uses the cron sweeper, and `/api/webhooks/recall`
is available to drive transitions instantly if you point the Recall dashboard at it.

---

## Third-party tools

| Tool | Used for |
|---|---|
| [Next.js 16](https://nextjs.org) + React 19 | App Router, server components, route handlers |
| [Drizzle ORM](https://orm.drizzle.team) | Schema, migrations, typed queries |
| [Auth.js v5](https://authjs.dev) | Google OAuth + demo credentials |
| [Deepgram](https://deepgram.com) Nova-3 | Speech-to-text, diarization, word timings |
| [Anthropic Claude](https://anthropic.com) | Notes, sentence classification, AskFred |
| [wavesurfer.js](https://wavesurfer.xyz) | Waveform + playback |
| [Radix UI](https://radix-ui.com) · [Tailwind v4](https://tailwindcss.com) · [lucide](https://lucide.dev) · [cmdk](https://cmdk.paco.me) · [sonner](https://sonner.emilkowal.ski) | UI primitives |
| [Recall.ai](https://recall.ai) | Real notetaker bots for Meet / Zoom / Teams |
| [Vercel Blob](https://vercel.com/docs/vercel-blob) | Media storage |
| [Playwright](https://playwright.dev) | End-to-end test scripts |

Built with Claude Code.

---

## Testing

```bash
pnpm typecheck          # tsc --noEmit
pnpm lint
pnpm build

pnpm test:e2e           # real upload → Deepgram → notes, polling the job table
pnpm test:features      # share links, soundbites, comments, AskFred streaming, exports
pnpm shots              # screenshots every screen, fails loudly on console errors
```

The e2e scripts drive a real browser against `pnpm dev`, so start the dev server first.

---

## Assumptions

- **One workspace per user.** No billing, seats, or AI-credit metering.
- **Tab audio requires the user to tick "Also share tab audio"** in Chrome's picker — a browser
  constraint, surfaced in the recorder UI.
- **Diarization yields "Speaker 1 / 2 / 3."** Mapping those to real people is a manual rename
  (which applies across the whole transcript). Real Fireflies behaves the same until voice
  profiles are trained.
- **Seeded meetings have transcripts but no stored audio.** The player falls back to a virtual
  timeline so transcript sync is still demonstrable; the UI says "No audio".
- **Calendar integration is out of scope.** Upcoming meetings would need Google Calendar scopes
  and a sync loop.

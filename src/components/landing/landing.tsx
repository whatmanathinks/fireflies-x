"use client";

import {
  ArrowRight,
  BarChart3,
  Bot,
  ListChecks,
  Mic,
  Search,
  Sparkles,
  Waves,
} from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const FEATURES = [
  {
    icon: Mic,
    title: "Capture anything",
    body: "Record a call straight from your browser, send a notetaker bot into Meet, Zoom or Teams, or drop in a file you already have.",
  },
  {
    icon: Waves,
    title: "Transcripts that know who spoke",
    body: "Speaker diarization with word-level timings, so every sentence is clickable and lands you at the exact moment.",
  },
  {
    icon: Sparkles,
    title: "Notes worth reading",
    body: "Overview, chapters and action items generated from the transcript — never invented, always traceable to what was said.",
  },
  {
    icon: Search,
    title: "Search every word",
    body: "Full-text search across every meeting, plus one-click filters for tasks, questions, metrics, pricing and dates.",
  },
  {
    icon: ListChecks,
    title: "Nothing gets dropped",
    body: "Every commitment becomes a task with an owner and a due date, linked back to the second it was made.",
  },
  {
    icon: BarChart3,
    title: "Know how you meet",
    body: "Talk time, words per minute, filler words and monologue length — computed from timings, not guessed by a model.",
  },
];

const STEPS = [
  { n: "01", title: "Capture", body: "Hit record, or send the notetaker to the call." },
  { n: "02", title: "Transcribe", body: "Speakers separated, timestamps on every word." },
  { n: "03", title: "Ask anything", body: "Notes, tasks and answers that cite the moment." },
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("focus", reset);
    };
  }, []);

  const startDemo = () => {
    setPending(true);
    signIn("demo", { callbackUrl: "/home" });
    setTimeout(() => setPending(false), 8000);
  };

  return (
    <div className="min-h-screen bg-[#080a12] text-white">
      <div className="relative overflow-hidden">
        <Starfield />

        <div className="relative z-10">
          <div className="border-b border-white/[0.07] bg-gradient-to-r from-brand-600/25 via-violet-500/20 to-brand-600/25">
            <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2 text-[12.5px]">
              <span className="rounded bg-emerald-400/15 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-emerald-300">
                Live
              </span>
              <span className="text-white/70">
                Real transcription, real AI notes, a real notetaker bot.
              </span>
              <button
                onClick={startDemo}
                className="font-medium text-white underline underline-offset-4 hover:text-brand-200"
              >
                Try it now
              </button>
            </div>
          </div>

          <header className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-bold">
                F
              </span>
              <span className="text-[15px] font-semibold tracking-tight">FireflyX</span>
            </Link>

            <nav className="ml-8 hidden items-center gap-6 text-[13.5px] text-white/60 md:flex">
              <a href="#features" className="transition hover:text-white">Features</a>
              <a href="#how" className="transition hover:text-white">How it works</a>
              <a
                href="https://github.com/whatmanathinks/fireflies-x"
                className="transition hover:text-white"
              >
                Source
              </a>
            </nav>

            <div className="ml-auto flex items-center gap-2.5">
              <button
                onClick={startDemo}
                disabled={pending}
                className="rounded-lg border border-white/15 px-3.5 py-2 text-[13.5px] font-medium text-white/90 transition hover:border-white/30 hover:bg-white/5 disabled:opacity-60"
              >
                View demo
              </button>
              <Link
                href={signedIn ? "/home" : "/login"}
                className="rounded-lg bg-white px-3.5 py-2 text-[13.5px] font-semibold text-[#080a12] transition hover:bg-white/90"
              >
                {signedIn ? "Open app" : "Get started"}
              </Link>
            </div>
          </header>

          <section className="mx-auto max-w-4xl px-6 pb-8 pt-14 text-center sm:pt-20">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70">
              <Bot className="size-3.5 text-brand-300" />
              Bots for Meet, Zoom &amp; Teams
            </span>

            <h1 className="mt-6 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[58px]">
              Never take meeting
              <br />
              notes again.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/60">
              Record, transcribe, summarize and search every conversation your team has — then ask
              questions and get answers that cite the exact moment.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={startDemo}
                disabled={pending}
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[14.5px] font-semibold shadow-lg shadow-brand-600/25 transition hover:bg-brand-500 disabled:opacity-70"
              >
                {pending ? "Opening demo…" : "Try the live demo"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-6 text-[14.5px] font-medium text-white/90 transition hover:border-white/30 hover:bg-white/5"
              >
                Sign in
              </Link>
            </div>

            <p className="mt-3.5 text-[12.5px] text-white/40">
              No signup. You get your own private workspace, preloaded with transcribed meetings.
            </p>

            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[12.5px] font-medium text-emerald-300">
                No simulation — the bot joins real meetings and records real output.
              </span>
            </div>

          </section>

          <Pipeline />
        </div>
      </div>

      <section id="features" className="border-t border-white/[0.07] bg-[#0a0d16]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-lg text-[30px] font-semibold leading-tight tracking-[-0.02em]">
            Everything after the call,
            <span className="text-white/40"> handled.</span>
          </h2>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:border-brand-500/40 hover:bg-white/[0.04]"
              >
                <span className="mb-3.5 flex size-9 items-center justify-center rounded-lg bg-brand-600/15 text-brand-300 transition group-hover:bg-brand-600/25">
                  <Icon className="size-[18px]" />
                </span>
                <h3 className="text-[14.5px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">
                Three steps,
                <span className="text-white/40"> zero effort.</span>
              </h2>
              <div className="mt-8 space-y-6">
                {STEPS.map((step) => (
                  <div key={step.n} className="flex gap-4">
                    <span className="font-mono text-[12px] text-brand-400">{step.n}</span>
                    <div>
                      <h3 className="text-[15px] font-semibold">{step.title}</h3>
                      <p className="mt-0.5 text-[13.5px] text-white/50">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-2 text-[12px] text-white/40">
                <Sparkles className="size-3.5 text-brand-400" />
                AskFred
              </div>
              <div className="space-y-3.5">
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-xl rounded-br-sm bg-brand-600 px-3 py-2 text-[13px]">
                    What did we decide about pricing?
                  </p>
                </div>
                <p className="text-[13px] leading-[1.7] text-white/70">
                  No repricing before the executive review — Priya confirmed no pricing changes
                  until October 3rd{" "}
                  <span className="rounded bg-brand-500/20 px-1 font-mono text-[11px] text-brand-300">
                    07:01
                  </span>
                  . Tomas owns the one-pager with both scenarios, due September 26th{" "}
                  <span className="rounded bg-brand-500/20 px-1 font-mono text-[11px] text-brand-300">
                    03:17
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.07] bg-gradient-to-b from-[#0a0d16] to-[#080a12]">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">
            See it on real meetings.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-white/50">
            The demo workspace is preloaded with transcribed meetings — notes, tasks, analytics and
            search all work exactly as they would on your own calls.
          </p>
          <button
            onClick={startDemo}
            disabled={pending}
            className="group mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-[14.5px] font-semibold text-[#080a12] transition hover:bg-white/90 disabled:opacity-70"
          >
            {pending ? "Opening demo…" : "Open the demo"}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-8 text-[12.5px] text-white/35 sm:flex-row">
          <span className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-brand-600 text-[10px] font-bold text-white">
              F
            </span>
            FireflyX
          </span>
          <span className="sm:ml-auto">
            An independent clone built as an engineering exercise — not affiliated with
            Fireflies.ai.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Starfield() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[110px]" />
      <div className="absolute right-[-10rem] top-32 h-[26rem] w-[26rem] rounded-full bg-violet-600/12 blur-[100px]" />
      <div className="ff-stars absolute inset-0 opacity-70" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#080a12]" />
    </div>
  );
}

const STAGES = [
  {
    step: "01",
    vendor: "Recall.ai",
    title: "Joins the meeting",
    body: "A real bot dials into Google Meet, Zoom or Teams, sits in the call as a participant, and records it.",
    detail: "Meet · Zoom · Teams",
    accent: "from-sky-500/20 to-sky-500/0",
    ring: "group-hover:border-sky-400/40",
    dot: "bg-sky-400",
    icon: Bot,
  },
  {
    step: "02",
    vendor: "Deepgram Nova-3",
    title: "Turns audio into transcript",
    body: "Speaker diarization with word-level timestamps, so every sentence knows who said it and exactly when.",
    detail: "Diarized · word-level timings",
    accent: "from-emerald-500/20 to-emerald-500/0",
    ring: "group-hover:border-emerald-400/40",
    dot: "bg-emerald-400",
    icon: Waves,
  },
  {
    step: "03",
    vendor: "GPT-OSS 120B",
    title: "Reads and analyses it",
    body: "Overview, chapters, action items and answers — grounded in the transcript. Swap in Claude, Gemini or a local model any time.",
    detail: "Bring your own model",
    accent: "from-brand-500/25 to-brand-500/0",
    ring: "group-hover:border-brand-400/50",
    dot: "bg-brand-400",
    icon: Sparkles,
  },
];

function Pipeline() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="mb-8 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/35">
          How it actually works
        </p>
        <h2 className="mt-2.5 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
          Three services. One pipeline.
        </h2>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <div key={stage.step} className="relative">
              <div
                className={`group relative h-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 transition ${stage.ring}`}
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b ${stage.accent} blur-2xl`}
                />
                <div className="relative">
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                      <Icon className="size-[17px] text-white/80" />
                    </span>
                    <span className="font-mono text-[11px] text-white/30">{stage.step}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/55">
                      <span className={`size-1.5 rounded-full ${stage.dot}`} />
                      {stage.vendor}
                    </span>
                  </div>

                  <h3 className="text-[15.5px] font-semibold">{stage.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">{stage.body}</p>

                  <p className="mt-4 border-t border-white/[0.07] pt-3 font-mono text-[11px] text-white/35">
                    {stage.detail}
                  </p>
                </div>
              </div>

              {i < STAGES.length - 1 && (
                <span className="absolute -right-[7px] top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                  <span className="flex size-3.5 items-center justify-center rounded-full border border-white/15 bg-[#0d1018]">
                    <ArrowRight className="size-2 text-white/40" />
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-center text-[12.5px] text-white/35">
        Recording, transcription and analysis are all real. Nothing on this page is a mockup.
      </p>
    </section>
  );
}

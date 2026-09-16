"use client";

import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, Input, SectionLabel } from "@/components/ui/misc";
import { TEMPLATES } from "@/lib/ai/templates";

type Workspace = {
  id: string;
  name: string;
  defaultPrivacy: string;
  defaultTemplate: string;
  language: string;
  customVocabulary: string[];
  autoJoinMode: string;
};

const AUTO_JOIN = [
  { value: "all", label: "All meetings with a link" },
  { value: "owned", label: "Only meetings I own" },
  { value: "manual", label: "Only when I invite it" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
];

export function SettingsForm({
  user,
  workspace,
  capabilities,
}: {
  user: { name: string; email: string; image: string | null };
  workspace: Workspace;
  capabilities: {
    stt: boolean;
    llm: string;
    blob: boolean;
    google: boolean;
    webhooks: boolean;
    notetaker: boolean;
    missing: string[];
  };
}) {
  const [form, setForm] = useState(workspace);
  const [vocabInput, setVocabInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: Partial<Workspace>) {
    const merged = { ...form, ...next };
    setForm(merged);
    setSaving(true);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (!res.ok) toast.error("Could not save");
  }

  function addVocab() {
    const term = vocabInput.trim();
    if (!term || form.customVocabulary.includes(term)) return;
    save({ customVocabulary: [...form.customVocabulary, term] });
    setVocabInput("");
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-7">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Settings</h1>
          {saving && <Loader2 className="size-3.5 animate-spin text-ink-400" />}
        </div>

        <section className="mt-6">
          <SectionLabel className="mb-2.5">Profile</SectionLabel>
          <Card className="flex items-center gap-3 px-4 py-3.5">
            <Avatar name={user.name} image={user.image} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink-900">{user.name}</p>
              <p className="truncate text-[12.5px] text-ink-500">{user.email}</p>
            </div>
          </Card>
        </section>

        <section className="mt-6">
          <SectionLabel className="mb-2.5">Workspace</SectionLabel>
          <Card className="divide-y divide-line">
            <Row label="Name" hint="Shown in the account menu">
              <Input
                value={form.name}
                className="w-56"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onBlur={(e) => save({ name: e.target.value })}
              />
            </Row>

            <Row label="Default privacy" hint="Applied to newly captured meetings">
              <Select
                value={form.defaultPrivacy}
                onChange={(v) => save({ defaultPrivacy: v })}
                options={[
                  { value: "private", label: "Only me" },
                  { value: "workspace", label: "Everyone in workspace" },
                  { value: "public", label: "Anyone with the link" },
                ]}
              />
            </Row>

            <Row label="Default notes template" hint="Used when notes are first generated">
              <Select
                value={form.defaultTemplate}
                onChange={(v) => save({ defaultTemplate: v })}
                options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
              />
            </Row>

            <Row label="Transcription language">
              <Select
                value={form.language}
                onChange={(v) => save({ language: v })}
                options={LANGUAGES}
              />
            </Row>

            <Row label="Auto-join rule" hint="Applies to the notetaker bot">
              <Select
                value={form.autoJoinMode}
                onChange={(v) => save({ autoJoinMode: v })}
                options={AUTO_JOIN}
              />
            </Row>
          </Card>
        </section>

        <section className="mt-6">
          <SectionLabel className="mb-1">Custom vocabulary</SectionLabel>
          <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink-500">
            Names, products and jargon the speech model should expect. Passed to Deepgram as
            keyterms, which measurably improves how often they&rsquo;re spelled correctly.
          </p>
          <Card className="px-4 py-3.5">
            <div className="mb-2.5 flex gap-1.5">
              <Input
                value={vocabInput}
                placeholder="e.g. PgBouncer, Datastream, Raghavan"
                onChange={(e) => setVocabInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addVocab()}
              />
              <Button variant="secondary" onClick={addVocab}>
                Add
              </Button>
            </div>
            {form.customVocabulary.length === 0 ? (
              <p className="text-[12.5px] text-ink-400">No custom terms yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {form.customVocabulary.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center gap-1 rounded-md bg-ink-100 py-0.5 pl-2 pr-1 text-[12px] text-ink-700"
                  >
                    {term}
                    <button
                      onClick={() =>
                        save({
                          customVocabulary: form.customVocabulary.filter((t) => t !== term),
                        })
                      }
                      className="rounded p-0.5 hover:bg-ink-200"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="mt-6 mb-10">
          <SectionLabel className="mb-1">Service status</SectionLabel>
          <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink-500">
            What this deployment can actually do right now. Anything switched off degrades to a
            scripted fallback rather than failing.
          </p>
          <Card className="divide-y divide-line">
            <Capability
              on={capabilities.stt}
              label="Speech-to-text"
              onText="Deepgram Nova-3 with diarization"
              offText="Scripted transcripts (set DEEPGRAM_API_KEY)"
            />
            <Capability
              on={!capabilities.llm.startsWith("Scripted")}
              label="Notes & AskFred"
              onText={capabilities.llm}
              offText="Keyword summarizer (set ANTHROPIC_API_KEY or LLM_API_KEY)"
            />
            <Capability
              on={capabilities.blob}
              label="Media storage"
              onText="Vercel Blob"
              offText="Local disk under .data/media (fine for development)"
            />
            <Capability
              on={capabilities.google}
              label="Google sign-in"
              onText="Enabled"
              offText="Demo login only (set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)"
            />
            <Capability
              on={capabilities.notetaker}
              label="Notetaker bot"
              onText="Recall.ai — joins Meet, Zoom and Teams for real"
              offText="Simulated bot (set RECALL_API_KEY)"
            />
            <Capability
              on={capabilities.webhooks}
              label="Async transcription"
              onText="Deepgram callbacks enabled"
              offText="Synchronous mode — localhost can't receive webhooks"
            />
          </Card>

          {capabilities.missing.length > 0 && (
            <div className="mt-2.5 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>
                Not configured: {capabilities.missing.join(", ")}. See{" "}
                <code className="rounded bg-amber-100 px-1">.env.example</code> for what each one
                unlocks.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-800">{label}</p>
        {hint && <p className="mt-0.5 text-[11.5px] text-ink-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8.5 w-56 shrink-0 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink-800 outline-none focus:border-brand-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Capability({
  on,
  label,
  onText,
  offText,
}: {
  on: boolean;
  label: string;
  onText: string;
  offText: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={
          on
            ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            : "flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400"
        }
      >
        {on ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-800">{label}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-500">{on ? onText : offText}</p>
      </div>
      <Badge tone={on ? "green" : "neutral"}>{on ? "Active" : "Fallback"}</Badge>
    </div>
  );
}

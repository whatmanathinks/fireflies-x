import type { TranscriptLine } from "./client";
import type { ClassifyResult, SummaryResult } from "./schemas";

const METRIC_RE =
  /\b\d+(\.\d+)?\s?(percent|%|ms|milliseconds|seconds|x|times|k|million|billion)\b|\b(p95|p99|ndcg)\b|\b\d{2,}\b/i;
const PRICING_RE =
  /\b(price|pricing|cost|costs|budget|margin|revenue|arr|dollar|cents?|thousand|million|contract|quote|list|tier|discount|reprice|repricing|unit economics|threshold|approve)\b/i;
const ORDINAL = String.raw`(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|(?:thir|four|fif|six|seven|eigh|nine)teenth|twentieth|thirtieth|twenty[- ]\w+|thirty[- ]\w+|\d{1,2}(?:st|nd|rd|th))`;

const DATE_RE = new RegExp(
  String.raw`\b(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+${ORDINAL}` +
    String.raw`|(?:january|february|march|april|may|june|july|august|september|october|november|december)` +
    String.raw`|(?:by|on|before|after)\s+(?:the\s+)?${ORDINAL}` +
    String.raw`|the\s+${ORDINAL}` +
    String.raw`|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)` +
    String.raw`|today|tomorrow|tonight|this week|next week|end of (?:the )?(?:month|year|quarter)|q[1-4]|deadline)\b`,
  "i",
);
const TASK_RE =
  /\b(i'll|i will|we'll|we will|can you|could you|let's|lets|i'm going to|we need to|you should|take the|i'll have|i'll get|i'll send|i'll write|own the|owns the|put together|follow up|action item|by (friday|monday|tuesday|wednesday|thursday|the \w+)|will coordinate|i'll ping|i'll talk|i'll include|i'll change|i'll have it)\b/i;

const POSITIVE_RE =
  /\b(great|good|nice|excellent|perfect|helpful|useful|agreed|thank you|thanks|appreciate|happy|transformative|really good|works|makes sense|obviously right|catch)\b/i;
const NEGATIVE_RE =
  /\b(problem|issue|broke|broken|leak|regression|behind|slipping|worries|worry|concern|risk|blocker|fail|failed|garbage|scattered|harder|kills|painful|can't|cannot|blind|noise|not clearly|didn't have)\b/i;

export function heuristicClassify(lines: TranscriptLine[]): ClassifyResult {
  const result: ClassifyResult = {
    tasks: [],
    questions: [],
    metrics: [],
    pricing: [],
    dates: [],
    positive: [],
    negative: [],
  };

  for (const line of lines) {
    const t = line.text;
    if (t.trim().endsWith("?")) result.questions.push(line.index);
    if (METRIC_RE.test(t)) result.metrics.push(line.index);
    if (PRICING_RE.test(t)) result.pricing.push(line.index);
    if (DATE_RE.test(t)) result.dates.push(line.index);
    if (TASK_RE.test(t)) result.tasks.push(line.index);

    const pos = POSITIVE_RE.test(t);
    const neg = NEGATIVE_RE.test(t);
    if (pos && !neg) result.positive.push(line.index);
    else if (neg && !pos) result.negative.push(line.index);
  }

  return result;
}

const STOPWORDS = new Set(
  `the a an and or but if then so of to in on at for with from by is are was were be been being am
   it its that this these those there here i you he she we they them us our your their my me him her
   do does did done have has had having will would shall should can could may might must
   about not no yes just really very much more most also only actually basically honestly obviously
   okay right yeah yep nope what which who whom whose when where why how all any some each other
   than because while as up down out off over under again further once still even ever never
   thing things stuff lot lots bit kind sort way ways going gonna wanna let lets
   think thought know knew guess mean means said say says saying talk talking
   good great nice fine sure okay well yeah maybe perhaps probably
   week weeks day days month months year years time times today tomorrow
   percent point number numbers one two three four five six seven eight nine ten
   hundred thousand million billion first second third next last
   meeting meetings call calls discussion discuss discussed agenda
   need needs needed want wants wanted like likes liked make makes made take takes taken
   get gets got give gives given put puts see sees seen look looks looking come comes came
   go goes went work works working use uses used
   rather please thanks thank anything anyone everything everyone something someone nothing
   before after else both either neither same different real true false type types
   sorry honestly frankly exactly totally definitely certainly absolutely
   question questions answer answers point points part parts case cases
   people person team teams everybody anybody somebody`
    .split(/\s+/)
    .filter(Boolean),
);

function contentTokens(text: string) {
  return text
    .split(/[^A-Za-z0-9'-]+/)
    .map((w) => w.replace(/'(s|re|ve|ll|d|t|m)$/i, ""))
    .filter((w) => w.length > 3 && !w.includes("'") && !STOPWORDS.has(w.toLowerCase()));
}

function titleCase(word: string) {
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function speakerTokens(lines: TranscriptLine[]) {
  const names = new Set<string>();
  for (const line of lines) {
    for (const part of line.speakerName.split(/\s+/)) {
      if (part.length > 2) names.add(part.toLowerCase());
    }
  }
  return names;
}

function topKeywords(lines: TranscriptLine[], limit: number, exclude?: Set<string>) {
  const unigrams = new Map<string, { count: number; display: string }>();
  const bigrams = new Map<string, { count: number; display: string }>();

  for (const line of lines) {
    const tokens = contentTokens(line.text).filter((t) => !exclude?.has(t.toLowerCase()));
    for (const raw of tokens) {
      const key = raw.toLowerCase();
      const entry = unigrams.get(key);
      const looksProper = /^[A-Z]/.test(raw) && !/^[A-Z]+$/.test(raw);
      unigrams.set(key, {
        count: (entry?.count ?? 0) + (looksProper ? 2 : 1),
        display: entry?.display ?? (looksProper ? raw : titleCase(raw)),
      });
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      const key = `${tokens[i].toLowerCase()} ${tokens[i + 1].toLowerCase()}`;
      const entry = bigrams.get(key);
      bigrams.set(key, {
        count: (entry?.count ?? 0) + 1,
        display: entry?.display ?? `${titleCase(tokens[i])} ${titleCase(tokens[i + 1])}`,
      });
    }
  }

  const phrases = [...bigrams.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, Math.ceil(limit / 2));

  const covered = new Set(phrases.flatMap(([k]) => k.split(" ")));

  const singles = [...unigrams.entries()]
    .filter(([k, v]) => v.count >= 2 && !covered.has(k))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  return [...phrases, ...singles]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([, v]) => v.display);
}

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function heuristicSummary(
  lines: TranscriptLine[],
  classified: ClassifyResult,
  meetingTitle: string,
  meetingType: string,
): SummaryResult {
  const taskSet = new Set(classified.tasks);
  const metricSet = new Set(classified.metrics);

  const speakers = [...new Set(lines.map((l) => l.speakerName))];
  const names = speakerTokens(lines);
  const keywords = topKeywords(lines, 10, names);

  const chapterCount = Math.min(7, Math.max(3, Math.round(lines.length / 18)));
  const perChapter = Math.ceil(lines.length / chapterCount);
  const outline = Array.from({ length: chapterCount }, (_, i) => {
    const slice = lines.slice(i * perChapter, (i + 1) * perChapter);
    if (slice.length === 0) return null;
    const topic = topKeywords(slice, 1, names)[0];
    const anchor =
      slice.find((l) => metricSet.has(l.index) && l.text.length > 50) ??
      slice.find((l) => l.text.length > 90) ??
      slice[0];
    return {
      title: topic ?? clean(anchor.text).split(/\s+/).slice(0, 5).join(" "),
      start_sentence_index: slice[0].index,
      summary: clean(anchor.text).slice(0, 220),
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const action_items = lines
    .filter((l) => taskSet.has(l.index) && l.text.length > 28)
    .slice(0, 10)
    .map((l) => ({
      text: clean(l.text),
      assignee: l.speakerName,
      due_date: l.text.match(DATE_RE)?.[0] ?? null,
      sentence_index: l.index,
    }));

  const metricLines = lines.filter((l) => metricSet.has(l.index) && l.text.length > 45).slice(0, 6);

  const bullet_gist = metricLines.slice(0, 5).map((l) => clean(l.text).slice(0, 180));

  const shorthand_bullet = lines
    .filter((l) => l.text.length > 60 && (metricSet.has(l.index) || taskSet.has(l.index)))
    .slice(0, 14)
    .map((l) => `${l.speakerName.split(" ")[0]}: ${clean(l.text).slice(0, 150)}`);

  const salient = lines
    .filter((l) => l.text.length > 70)
    .map((l) => ({
      line: l,
      score:
        (metricSet.has(l.index) ? 3 : 0) +
        (taskSet.has(l.index) ? 2 : 0) +
        Math.min(3, l.text.length / 90),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .sort((a, b) => a.line.index - b.line.index)
    .map((s) => s.line);

  const overview = [0, 1, 2]
    .map((chunk) =>
      salient
        .slice(chunk * 3, chunk * 3 + 3)
        .map((l) => `${l.speakerName.split(" ")[0]}: ${clean(l.text)}`)
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");

  const headline = salient[0] ?? lines[0];

  return {
    gist: `${meetingType} between ${speakers.slice(0, 3).join(", ")}${speakers.length > 3 ? ` +${speakers.length - 3}` : ""}`,
    short_summary: `${meetingTitle} covered ${keywords.slice(0, 3).join(", ")}. ${clean(headline?.text ?? "").slice(0, 200)}`,
    overview:
      overview || salient.map((l) => `${l.speakerName}: ${clean(l.text)}`).join("\n\n"),
    keywords,
    topics_discussed: keywords.slice(0, 6),
    meeting_type: meetingType,
    bullet_gist: bullet_gist.length
      ? bullet_gist
      : salient.slice(0, 3).map((l) => clean(l.text).slice(0, 180)),
    shorthand_bullet,
    outline,
    action_items,
  };
}

export type TemplateId =
  | "general"
  | "sales"
  | "one_on_one"
  | "interview"
  | "standup";

export const TEMPLATES: {
  id: TemplateId;
  label: string;
  description: string;
  guidance: string;
}[] = [
  {
    id: "general",
    label: "General Summary",
    description: "Balanced overview for any meeting",
    guidance:
      "Produce a balanced, neutral summary suitable for anyone who missed the meeting.",
  },
  {
    id: "sales",
    label: "Sales / BANT",
    description: "Budget, Authority, Need, Timeline",
    guidance:
      "This is a sales conversation. Organise the outline around BANT: Budget (any figures, pricing, or approval thresholds discussed), Authority (who decides and who signs), Need (the concrete pain and its measured cost), and Timeline (dates, deadlines, and process gates such as security review). Surface objections and competitor mentions explicitly. Note any commitments the seller made.",
  },
  {
    id: "one_on_one",
    label: "1:1 Meeting Notes",
    description: "Manager / report conversation",
    guidance:
      "This is a one-on-one between a manager and a report. Organise the outline around: how the person is doing, workload and focus, blockers, growth and career, and feedback in both directions. Be careful and precise with anything about promotion, compensation, or performance - quote rather than paraphrase where the exact wording matters. Action items should capture commitments made by both people.",
  },
  {
    id: "interview",
    label: "Interview Debrief",
    description: "Candidate evaluation",
    guidance:
      "This is a candidate interview. Organise the outline around: background, technical signal, examples given, questions the candidate asked, and concerns. Keep evaluative language grounded in what was actually said.",
  },
  {
    id: "standup",
    label: "Standup Notes",
    description: "Per-person status",
    guidance:
      "This is a status meeting. Organise the outline per person: what shipped, what is in progress, and what is blocked. Keep it short and scannable.",
  },
];

export function templateById(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

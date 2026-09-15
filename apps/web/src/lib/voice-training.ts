/** Voice studio training pack — Professional Identity Clone */

export type ReadingSlotId = "reading";
export type ProfessionalSlotId = "professional";
export type OpenSlotId = "open";
export type RecruiterSlotId =
  | "recruiter-self"
  | "recruiter-why"
  | "recruiter-salary"
  | "recruiter-reloc";

export type SlotId = ReadingSlotId | ProfessionalSlotId | OpenSlotId | RecruiterSlotId;

export const READING_PASSAGE = {
  id: "reading" as const,
  title: "Task 1 — Reading passage",
  purpose: "Pronunciation, consonants, vowels, speaking speed, and accent",
  minutes: "~3 minutes",
  guidance:
    "Read this out loud at your normal pace. Do not perform. Include the numbers, dates, and names clearly — that is the point.",
  text: `My name is Alex Morgan, and I currently work as a Senior Data Analyst at Northwind Analytics. I started this role on March 15, 2021, after spending three years at Contoso Labs from 2018 to 2021. In a typical week I write Python scripts, run SQL queries across about 2.4 million rows, and build dashboards in Power BI and Tableau. Last quarter we improved forecast accuracy from 71 percent to 86 percent, which saved the team roughly $120,000. I collaborate with product managers in Seattle, engineers in Austin, and a finance partner named Priya Sharma. Common tools for me include PostgreSQL, Snowflake, dbt, AWS, Git, and Jupyter. When I leave a voicemail I say: please call me back at 555-0142 before Friday, July 12. My LinkedIn is linkedin.com/in/alexmorgan, and my email is alex.morgan@example.com. I speak clearly about APIs, ETL pipelines, A/B tests, and machine learning models without rushing the technical terms.`,
};

export const PROFESSIONAL_PASSAGE = {
  id: "professional" as const,
  title: "Task 2 — Recruiter-call voice",
  purpose: "Professional tone for a real screening call",
  minutes: "~3 minutes",
  guidance:
    "Read this like you are already on a recruiter call — calm, clear, confident. This is more valuable for Verba than a dictionary reading.",
  text: `Thank you for reaching out. I currently have over five years of experience in data analytics and data engineering, with a focus on turning messy business questions into production systems people actually use. Most recently I've been owning end-to-end work — from discovery and modeling through deployment and monitoring. I'm based in the United States and open to discussing hybrid or remote setups depending on the team. On authorization and sponsorship, I'll keep that straightforward and accurate. For compensation, I usually share a target range and stay flexible around the full package. I'm looking for a role with clear ownership, strong collaboration between product and engineering, and problems that matter. Happy to walk through a recent project, my stack, or timeline whenever useful. If something needs a deeper technical round, I'd rather schedule that properly than rush it on a screen.`,
};

export const OPEN_PROMPTS = [
  {
    id: "movie",
    prompt: "Tell me about your favorite movie — what it is, why you like it, and what stuck with you.",
  },
  {
    id: "trip",
    prompt: "Tell me about a memorable trip — where you went, what happened, and how it felt.",
  },
  {
    id: "weekend",
    prompt: "Describe your ideal weekend — how you'd spend the days, and what makes it a good one for you.",
  },
] as const;

export const OPEN_TASK = {
  id: "open" as const,
  title: "Task 3 — Open conversation",
  purpose: "Pacing, pauses, sentence structure, confidence, and energy",
  minutes: "~3–5 minutes",
  guidance:
    "Do not read a script. Answer the prompt naturally. Verba cares about fillers, pauses, and rhythm — not the topic.",
};

export const RECRUITER_QUESTIONS: Array<{
  id: RecruiterSlotId;
  question: string;
}> = [
  {
    id: "recruiter-self",
    question: "Tell me about yourself.",
  },
  {
    id: "recruiter-why",
    question: "Why are you looking for a new role?",
  },
  {
    id: "recruiter-salary",
    question: "What are your salary expectations?",
  },
  {
    id: "recruiter-reloc",
    question: "Are you open to relocation?",
  },
];

export const RECRUITER_TASK = {
  title: "Task 4 — Answer recruiter questions",
  purpose: "Real recruiter-call answer length, formality, confidence, and favorite phrases",
  minutes: "~2–3 minutes",
  guidance:
    "Answer one question at a time, the way you would on a real phone screen. Natural length. No brochure language.",
};

export const ALL_REQUIRED_SLOTS: SlotId[] = [
  "reading",
  "professional",
  "open",
  ...RECRUITER_QUESTIONS.map((q) => q.id),
];

export function labelForSlot(id: string): string {
  switch (id) {
    case "reading":
    case "about":
      return "Task 1 — Reading passage";
    case "professional":
    case "screen":
      return "Task 2 — Recruiter-call voice";
    case "open":
    case "style":
      return "Task 3 — Open conversation";
    case "recruiter-self":
      return "Task 4 — Tell me about yourself";
    case "recruiter-why":
      return "Task 4 — Why looking";
    case "recruiter-salary":
      return "Task 4 — Salary expectations";
    case "recruiter-reloc":
      return "Task 4 — Relocation";
    default:
      return id;
  }
}

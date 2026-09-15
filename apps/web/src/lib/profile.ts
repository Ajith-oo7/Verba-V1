/** Full recruiter phone-screen questionnaire (~20–30 min). Answers are first-person drafts — edit to your words. */
export const DEFAULT_PREFERENCES = [
  {
    question: "Tell me about yourself.",
    answer:
      "I'm a Senior Data Scientist with about 6+ years building and shipping production ML systems — lately agentic LLM workflows, RAG, and risk/fraud models in financial services. I like owning the full path from messy data to something that actually changes how the business operates. Happy to go deeper on any part of that.",
  },
  {
    question: "Walk me through your background / resume.",
    answer:
      "Most recently I'm a Senior Data Scientist at Globe Life, focused on LangGraph/LangChain agent systems with RAG over internal docs, plus risk and fraud models. Before that I built production ML and data pipelines across similar high-stakes domains. The through-line is end-to-end ownership — data, training, deployment, and monitoring.",
  },
  {
    question: "How many years of experience do you have?",
    answer: "About 6+ years in data science / ML, with recent focus on LLM systems and production risk models.",
  },
  {
    question: "What is your age?",
    answer: "[Fill this in — e.g. I'm 28. Cherry will not invent an age.]",
  },
  {
    question: "Where are you located / based?",
    answer: "I'm based in Irving, Texas.",
  },
  {
    question: "Are you open to relocation?",
    answer: "[Fill this in — e.g. Open for the right role, or not looking to relocate right now.]",
  },
  {
    question: "Are you open to hybrid or onsite?",
    answer: "[Fill this in — e.g. Hybrid works well for me; I can do a few days onsite.]",
  },
  {
    question: "Do you need fully remote?",
    answer: "[Fill this in — e.g. Remote is preferred but hybrid is fine depending on the team.]",
  },
  {
    question: "What is your work authorization?",
    answer: "[Fill this in exactly — e.g. US citizen / Green card / H-1B / EAD.]",
  },
  {
    question: "Do you require sponsorship now or in the future?",
    answer: "[Fill this in — Yes or No, clearly.]",
  },
  {
    question: "What is your highest level of education?",
    answer: "[Fill from resume — degree, school, and year if relevant.]",
  },
  {
    question: "Why are you looking for a new role?",
    answer:
      "I'm looking for a place where I can work on larger-scale ML/LLM problems with a team that ships, and where the work has clear business impact. Not leaving in a rush — being selective about fit.",
  },
  {
    question: "Why are you interested in this company / role?",
    answer:
      "[Customize per company when you can.] In general I'm drawn to teams solving real production ML problems — especially LLM systems, risk, or data platforms — where I can own outcomes end to end.",
  },
  {
    question: "What are you looking for in your next role?",
    answer:
      "Ownership of production ML systems, strong collaboration with product/engineering, and problems that matter — ideally LLM/agentic systems, risk, or large-scale data science. I want room to grow technically and as a partner to the business.",
  },
  {
    question: "What technologies / stack have you worked with?",
    answer:
      "Day to day: Python, SQL, PyTorch/TensorFlow, XGBoost, LangChain/LangGraph, RAG with FAISS/OpenAI embeddings, Spark, Kafka, Databricks, cloud (AWS/Azure/GCP), MLflow, FastAPI, Docker. I pick tools based on the problem rather than chasing every new library.",
  },
  {
    question: "Tell me about a recent project you're proud of.",
    answer:
      "At Globe Life I built an agentic assistant with LangGraph/LangChain and a RAG pipeline over 800+ internal documents. It rolled out to 25+ agents and cut average query resolution time by about 35%. I also put evaluation around accuracy and hallucinations so model updates were safer to ship.",
  },
  {
    question: "What are your strengths?",
    answer:
      "I translate ambiguous business problems into production ML systems, and I stay close to the data and the deployment path — not just notebooks. Clear communication with non-ML stakeholders is a strength too.",
  },
  {
    question: "What are your weaknesses / areas to grow?",
    answer:
      "[Fill honestly — e.g. I can get deep into the technical details; I've been practicing leading with the business outcome first, then the method.]",
  },
  {
    question: "How do you prefer to work with a team?",
    answer:
      "I work best with clear ownership, frequent but lightweight syncs, and partners in eng/product who will push back. I'm comfortable leading technical discussions and also executing hands-on.",
  },
  {
    question: "Are you interviewing elsewhere / what's your timeline?",
    answer:
      "[Fill this in — e.g. I'm in early conversations elsewhere and hoping to decide over the next few weeks.]",
  },
  {
    question: "What is your current / target salary?",
    answer: "[Fill your range — Cherry will only share what you put here.]",
  },
  {
    question: "What is your current notice period / when can you start?",
    answer: "[Fill this in — e.g. Standard two weeks, flexible for the right role.]",
  },
  {
    question: "Are you comfortable with the interview process / next steps?",
    answer:
      "Yes — happy to walk through hiring steps. For deep technical or system-design rounds I'd rather schedule a proper interview than try to rush it on a screen.",
  },
  {
    question: "Do you have any questions for me / the recruiter?",
    answer:
      "I'd love to hear more about the team structure, what success looks like in the first six months, and how ML work is prioritized with product and engineering.",
  },
  {
    question: "Is there anything else I should know about you?",
    answer:
      "I care a lot about shipping reliable systems — evaluation, monitoring, and clear tradeoffs. If the role is heavy on that kind of ownership, that's where I do my best work.",
  },
];

export function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function estimateYearsExperience(
  resumeText: string,
  experience: unknown[],
): string {
  const text = resumeText || "";
  const match =
    text.match(/(\d+)\s*\+\s*years?\s+of\s+experience/i) ||
    text.match(/(\d+)\s*\+\s*years?/i) ||
    text.match(/over\s+(\d+)\s+years?/i) ||
    text.match(/(\d+)\s+years?\s+of\s+experience/i);
  if (match?.[1]) return `${match[1]}+ years`;

  const years: number[] = [];
  for (const item of experience) {
    if (!item || typeof item !== "object") continue;
    const dates = String((item as { dates?: string }).dates || "");
    const found = [...dates.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]));
    years.push(...found);
  }
  if (years.length >= 2) {
    const span = Math.max(...years) - Math.min(...years);
    if (span > 0 && span < 50) return `about ${span}+ years`;
  }
  return "not explicitly stated — infer carefully from role dates in the resume";
}

export function buildProfileCard(input: {
  fullName: string;
  headline: string;
  location: string;
  workAuthorization: string;
  requiresSponsorship: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  startDate: string;
  openToRelocation: boolean;
  openToHybrid: boolean;
  openToRemote: boolean;
  availability: string;
  linkedinUrl: string;
  portfolioUrl: string;
  skillsJson: string;
  experienceJson: string;
  educationJson: string;
  certificationsJson: string;
  resumeText?: string;
}) {
  const skills = safeJson(input.skillsJson);
  const experience = safeJson(input.experienceJson);
  const education = safeJson(input.educationJson);
  const certs = safeJson(input.certificationsJson);
  const years = estimateYearsExperience(input.resumeText || "", Array.isArray(experience) ? experience : []);
  const salary =
    input.salaryMin || input.salaryMax
      ? `${input.salaryCurrency} ${input.salaryMin ?? "?"}–${input.salaryMax ?? "?"}`
      : "not provided";

  const experienceLines = Array.isArray(experience)
    ? experience.slice(0, 6).map((role, index) => {
        if (!role || typeof role !== "object") return `${index + 1}. ${String(role)}`;
        const r = role as Record<string, string>;
        return `${index + 1}. ${r.title || "Role"} @ ${r.company || "Company"} (${r.dates || "dates n/a"}): ${
          r.summary || ""
        }`;
      })
    : [];

  return [
    `Name: ${input.fullName}`,
    `Headline: ${input.headline || "not provided"}`,
    `Total experience: ${years}`,
    `Location: ${input.location || "not provided"}`,
    `Work authorization: ${input.workAuthorization || "not provided"}`,
    `Requires sponsorship: ${input.requiresSponsorship ? "yes" : "no"}`,
    `Salary range: ${salary}`,
    `Start date / notice: ${input.startDate || "not provided"}`,
    `Relocation: ${input.openToRelocation ? "open" : "not open"}`,
    `Hybrid: ${input.openToHybrid ? "open" : "not open"}`,
    `Remote: ${input.openToRemote ? "open" : "not open"}`,
    `Availability notes: ${input.availability || "none"}`,
    `LinkedIn: ${input.linkedinUrl || "not provided"}`,
    `Portfolio: ${input.portfolioUrl || "not provided"}`,
    `Skills: ${Array.isArray(skills) ? skills.slice(0, 20).join(", ") : "not provided"}`,
    `Work history:`,
    ...(experienceLines.length ? experienceLines : ["not provided"]),
    `Education: ${Array.isArray(education) ? JSON.stringify(education.slice(0, 3)) : "not provided"}`,
    `Certifications: ${Array.isArray(certs) ? JSON.stringify(certs.slice(0, 4)) : "not provided"}`,
  ].join("\n");
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { id } = await params;
  const call = await prisma.call.findFirst({
    where: { id, userId: user.id },
    include: { turns: { orderBy: { at: "asc" } } },
  });
  if (!call) notFound();
  const questions = parseList(call.questionsJson);
  const responses = parseList(call.responsesJson);
  const followUps = parseList(call.followUpsJson);
  const evalResult = parseEval(call.evalJson);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-wide text-cherry">{call.interest || "review"}</p>
      <h1 className="mt-2 font-serif text-5xl">{call.companyName || call.jobTitle || "Screening call"}</h1>
      <p className="mt-2 text-mute">
        {call.recruiterName || "Recruiter unknown"} · {call.durationSec ?? 0}s · {call.mode}
      </p>
      <section className="mt-8 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="font-serif text-2xl">Summary</h2>
        <p className="mt-2 leading-relaxed text-mute">{call.summary || "Summary lands after Cherry hangs up."}</p>
      </section>
      {evalResult ? (
        <section className="mt-8 rounded-2xl bg-white p-5 shadow-card">
          <h2 className="font-serif text-2xl">Human-likeness check</h2>
          <p className="mt-2 text-sm text-mute">
            Score <span className="text-ink font-medium">{evalResult.score}/100</span>
            {evalResult.pass ? " · passed" : " · needs work"} · {evalResult.cherryTurns} Cherry turns
          </p>
          {evalResult.flags?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-cherry">
              {evalResult.flags.slice(0, 8).map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-moss">No AI-ism flags on this transcript.</p>
          )}
        </section>
      ) : null}
      <TwoCol title="Questions asked" items={questions} />
      <TwoCol title="Responses given" items={responses} />
      <TwoCol title="Follow-up" items={followUps} />
      <section className="mt-8">
        <h2 className="font-serif text-2xl">Transcript</h2>
        <div className="mt-4 grid gap-3">
          {call.turns.length === 0 ? <p className="text-mute">No turns saved for this call.</p> : null}
          {call.turns.map((turn) => (
            <div key={turn.id} className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">{turn.speaker}</p>
              <p className="mt-1">{turn.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TwoCol({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      <ul className="mt-3 grid gap-2">
        {items.length === 0 ? <li className="text-mute">None yet.</li> : null}
        {items.map((item) => (
          <li key={item} className="rounded-xl bg-white px-4 py-3 shadow-card">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function parseList(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseEval(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || parsed.score == null) return null;
    return {
      score: Number(parsed.score) || 0,
      pass: Boolean(parsed.pass),
      cherryTurns: Number(parsed.cherryTurns) || 0,
      flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    };
  } catch {
    return null;
  }
}

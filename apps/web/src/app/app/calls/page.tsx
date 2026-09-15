import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function CallsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const calls = await prisma.call.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-5xl">Call inbox</h1>
      <p className="mt-3 text-mute">Summaries, transcripts, and whether the recruiter sounded interested.</p>
      <div className="mt-8 grid gap-3">
        {calls.length === 0 ? (
          <p className="text-mute">
            No calls yet.{" "}
            <Link href="/app/edit?tab=listen" className="underline">
              Cherry
            </Link>{" "}
            first.
          </p>
        ) : null}
        {calls.map((call) => {
          const evalScore = readEvalScore(call.evalJson);
          return (
            <Link
              key={call.id}
              href={`/app/calls/${call.id}`}
              className="rounded-2xl border border-line bg-white px-5 py-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {call.companyName || call.recruiterName || "Screening call"} · {call.mode}
                  </p>
                  <p className="text-sm text-mute">
                    {call.startedAt.toLocaleString()} ·{" "}
                    {call.durationSec ? `${call.durationSec}s` : "in progress"}
                    {evalScore != null ? ` · eval ${evalScore}/100` : ""}
                  </p>
                </div>
                <span className="text-sm capitalize text-mute">{call.interest || call.status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function readEvalScore(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && parsed.score != null) return Number(parsed.score);
  } catch {
    /* ignore */
  }
  return null;
}

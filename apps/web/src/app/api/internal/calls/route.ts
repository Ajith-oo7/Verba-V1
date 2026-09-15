import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geminiJson } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-verba-internal") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const callId = String(body.callId || "");
  const turns = Array.isArray(body.turns) ? body.turns : [];
  if (!callId) return NextResponse.json({ error: "callId required" }, { status: 400 });

  const transcript = turns
    .map((turn: { speaker?: string; text?: string }) => `${turn.speaker === "cherry" ? "Cherry" : "Recruiter"}: ${turn.text || ""}`)
    .join("\n");

  let analysis = {
    recruiterName: "",
    companyName: "",
    jobTitle: "",
    interest: "moderate",
    summary: "Call ended.",
    questions: [] as string[],
    responses: [] as string[],
    followUps: [] as string[],
  };

  if (transcript.trim()) {
    try {
      analysis = await geminiJson<typeof analysis>(
        `Analyze this recruiter screening call handled by Cherry, an AI representative.
Return JSON:
{
  "recruiterName": "",
  "companyName": "",
  "jobTitle": "",
  "interest": "strong" | "moderate" | "low",
  "summary": "4 sentences max",
  "questions": ["recruiter questions"],
  "responses": ["Cherry responses, short"],
  "followUps": ["concrete next steps for the candidate"]
}
Interest: strong = they discussed next interview or asked for resume/JD next steps. low = short, disengaged, or they hung up quickly.

Transcript:
${transcript}`,
      );
    } catch (error) {
      analysis.summary = `Call saved. Analysis failed: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  const started = body.startedAt ? new Date(body.startedAt) : new Date();
  const ended = body.endedAt ? new Date(body.endedAt) : new Date();
  const durationSec = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));

  await prisma.transcriptTurn.deleteMany({ where: { callId } });
  if (turns.length) {
    await prisma.transcriptTurn.createMany({
      data: turns.map((turn: { speaker?: string; text?: string; at?: string }) => ({
        callId,
        speaker: turn.speaker === "cherry" ? "cherry" : "recruiter",
        text: String(turn.text || ""),
        at: turn.at ? new Date(turn.at) : new Date(),
      })),
    });
  }

  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      status: "completed",
      recruiterName: analysis.recruiterName || "",
      companyName: analysis.companyName || "",
      jobTitle: analysis.jobTitle || "",
      interest: analysis.interest || "moderate",
      summary: analysis.summary || "",
      questionsJson: JSON.stringify(analysis.questions || []),
      responsesJson: JSON.stringify(analysis.responses || []),
      followUpsJson: JSON.stringify(analysis.followUps || []),
      evalJson: JSON.stringify(body.eval || {}),
      durationSec,
      endedAt: ended,
    },
  });

  return NextResponse.json({ ok: true, callId: call.id });
}

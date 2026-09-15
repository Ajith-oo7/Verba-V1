import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import path from "path";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const samples = await prisma.voiceSample.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 48,
  });

  const voiceProfile = user.voiceProfile;

  return NextResponse.json({
    voiceProfile: voiceProfile
      ? {
          gender: voiceProfile.gender,
          cloneReady: voiceProfile.cloneReady,
          ttsVoice: voiceProfile.ttsVoice,
          consentAt: voiceProfile.consentAt,
          conversation: safeParse(voiceProfile.conversationJson),
          hasReference: Boolean(voiceProfile.referencePath),
        }
      : null,
    samples: samples.map((sample) => ({
      id: sample.id,
      label: labelFromPath(sample.path),
      duration: sample.duration,
      transcript: sample.transcript,
      createdAt: sample.createdAt,
      playUrl: `/api/voice/samples/${sample.id}`,
    })),
  });
}

function labelFromPath(filePath: string) {
  const base = path.basename(filePath);
  if (base.startsWith("reading-") || base.startsWith("about-")) return "Task 1 — Reading passage";
  if (base.startsWith("professional-") || base.startsWith("screen-")) return "Task 2 — Recruiter-call voice";
  if (base.startsWith("open-") || base.startsWith("style-")) return "Task 3 — Open conversation";
  if (base.startsWith("recruiter-self-")) return "Task 4 — Tell me about yourself";
  if (base.startsWith("recruiter-why-")) return "Task 4 — Why looking";
  if (base.startsWith("recruiter-salary-")) return "Task 4 — Salary expectations";
  if (base.startsWith("recruiter-reloc-")) return "Task 4 — Relocation";
  return base;
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

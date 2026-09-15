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
    take: 24,
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
  if (base.startsWith("about-")) return "Passage 1 — About you";
  if (base.startsWith("screen-")) return "Passage 2 — Screening answers";
  if (base.startsWith("style-")) return "Passage 3 — Natural rhythm";
  return base;
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

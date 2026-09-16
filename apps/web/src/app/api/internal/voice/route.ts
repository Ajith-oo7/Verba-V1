import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({
  userId: z.string().min(1),
  elevenLabsVoiceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (req.headers.get("x-verba-internal") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = schema.parse(await req.json());
    await prisma.voiceProfile.upsert({
      where: { userId: body.userId },
      update: {
        elevenLabsVoiceId: body.elevenLabsVoiceId,
        cloneReady: true,
        ttsVoice: `elevenlabs:${body.elevenLabsVoiceId}`,
      },
      create: {
        userId: body.userId,
        elevenLabsVoiceId: body.elevenLabsVoiceId,
        cloneReady: true,
        ttsVoice: `elevenlabs:${body.elevenLabsVoiceId}`,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save ElevenLabs voice failed:", error);
    return NextResponse.json({ error: "Could not save voice id." }, { status: 400 });
  }
}

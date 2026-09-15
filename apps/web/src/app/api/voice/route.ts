import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { transcribeFile } from "@/lib/groq";
import { ensureDir, voiceDir } from "@/lib/storage";
import path from "path";
import fs from "fs/promises";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const form = await req.formData();
    const consent = String(form.get("consent") || "") === "true";
    const gender = String(form.get("gender") || "unknown");
    if (!consent) {
      return NextResponse.json({ error: "Voice cloning requires explicit consent." }, { status: 400 });
    }

    const files = form.getAll("samples").filter((item): item is File => item instanceof File && item.size > 0);
    const labels = form.getAll("labels").map(String);
    const durations = form.getAll("durations").map((value) => Number(value) || 0);

    if (files.length < 3) {
      return NextResponse.json(
        { error: "Record all 3 passages before training Cherry." },
        { status: 400 },
      );
    }

    const dir = await ensureDir(path.join(voiceDir(), user.id));
    const transcripts: string[] = [];
    let referencePath = "";
    let bestBytes = 0;

    for (const [index, file] of files.entries()) {
      const label = labels[index] || `passage-${index + 1}`;
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".webm";
      const stored = path.join(dir, `${label}-${Date.now()}${ext}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(stored, buffer);

      let transcript = "";
      try {
        transcript = await transcribeFile(stored);
      } catch (error) {
        console.error(`Transcription failed for ${label}:`, error);
        transcript = "";
      }
      transcripts.push(`[${label}] ${transcript}`);

      await prisma.voiceSample.create({
        data: {
          userId: user.id,
          path: stored,
          transcript,
          duration: durations[index] || 0,
        },
      });

      if (buffer.byteLength > bestBytes) {
        bestBytes = buffer.byteLength;
        referencePath = stored;
      }
    }

    const conversation = await geminiJson<{
      formality: string;
      answerLength: string;
      typicalPhrases: string[];
      notes: string;
    }>(
      `You are building a speaking-style profile so Cherry can answer recruiter screens AS this exact person.

Read the transcripts carefully. Extract how THEY actually talk on a casual recording — not how a polished AI would rewrite them.

Transcripts:
${transcripts.join("\n\n---\n\n")}

Return JSON only:
{
  "formality": "casual|professional|formal",
  "answerLength": "short|medium",
  "typicalPhrases": ["up to 8 short phrases, fillers, or speech habits they actually used — quote them closely"],
  "notes": "3 sentences of coaching: cadence, how they start answers, how concrete vs abstract they are, and what to avoid so replies sound like THIS person on a phone — not an AI assistant. Be specific to these transcripts."
}`,
    );

    const ttsVoice =
      gender === "male"
        ? process.env.CHERRY_MALE_VOICE || "troy"
        : process.env.CHERRY_FEMALE_VOICE || "hannah";

    const voiceProfile = await prisma.voiceProfile.upsert({
      where: { userId: user.id },
      update: {
        consentAt: new Date(),
        gender,
        referencePath,
        cloneReady: Boolean(referencePath),
        conversationJson: JSON.stringify(conversation),
        ttsVoice,
      },
      create: {
        userId: user.id,
        consentAt: new Date(),
        gender,
        referencePath,
        cloneReady: Boolean(referencePath),
        conversationJson: JSON.stringify(conversation),
        ttsVoice,
      },
    });

    return NextResponse.json({
      ok: true,
      voiceProfile,
      conversation,
      transcripts,
      samples: files.length,
    });
  } catch (error) {
    console.error("Voice training failed:", error);
    const message = error instanceof Error ? error.message : "Voice training failed.";
    return NextResponse.json(
      {
        error:
          message.includes("401") || message.toLowerCase().includes("session")
            ? "Session expired. Sign in again."
            : `Voice training failed: ${message}`,
      },
      { status: 502 },
    );
  }
}

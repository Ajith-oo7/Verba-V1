import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { transcribeFile } from "@/lib/groq";
import { ensureDir, voiceDir } from "@/lib/storage";
import { ALL_REQUIRED_SLOTS, labelForSlot } from "@/lib/voice-training";
import path from "path";
import fs from "fs/promises";

type IdentityProfile = {
  voice_profile: {
    gender: string;
    clone_ready: boolean;
    notes: string;
  };
  speech_profile: {
    pace: string;
    clarity: string;
    accent_notes: string;
    pronunciation_notes: string;
  };
  conversation_profile: {
    formality: string;
    answerLength: string;
    typicalPhrases: string[];
    energy: string;
    pause_style: string;
    notes: string;
  };
  professional_profile: {
    screen_tone: string;
    confidence: string;
    structure: string;
    notes: string;
  };
  recruiter_answer_profile: {
    typical_answer_length: string;
    formality: string;
    confidence: string;
    favorite_phrases: string[];
    how_they_open: string;
    notes: string;
  };
  // Legacy flat fields Cherry already reads
  formality: string;
  answerLength: string;
  typicalPhrases: string[];
  notes: string;
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const form = await req.formData();
    const consent = String(form.get("consent") || "") === "true";
    const gender = String(form.get("gender") || "unknown");
    const openPrompt = String(form.get("openPrompt") || "");
    if (!consent) {
      return NextResponse.json({ error: "Voice cloning requires explicit consent." }, { status: 400 });
    }

    const files = form.getAll("samples").filter((item): item is File => item instanceof File && item.size > 0);
    const labels = form.getAll("labels").map(String);
    const durations = form.getAll("durations").map((value) => Number(value) || 0);

    const byLabel = new Map<string, { file: File; duration: number }>();
    for (const [index, file] of files.entries()) {
      const label = labels[index] || `passage-${index + 1}`;
      byLabel.set(label, { file, duration: durations[index] || 0 });
    }

    const missing = ALL_REQUIRED_SLOTS.filter((id) => !byLabel.has(id));
    if (missing.length) {
      return NextResponse.json(
        {
          error: `Complete all 4 training tasks first. Missing: ${missing.map(labelForSlot).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const dir = await ensureDir(path.join(voiceDir(), user.id));
    const transcriptByLabel: Record<string, string> = {};
    const pathByLabel: Record<string, string> = {};
    let longestPath = "";
    let bestBytes = 0;

    for (const label of ALL_REQUIRED_SLOTS) {
      const item = byLabel.get(label)!;
      const file = item.file;
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".webm";
      const stored = path.join(dir, `${label}-${Date.now()}${ext}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(stored, buffer);
      pathByLabel[label] = stored;

      let transcript = "";
      try {
        transcript = await transcribeFile(stored);
      } catch (error) {
        console.error(`Transcription failed for ${label}:`, error);
        transcript = "";
      }
      transcriptByLabel[label] = transcript;

      await prisma.voiceSample.create({
        data: {
          userId: user.id,
          path: stored,
          transcript,
          duration: item.duration,
        },
      });

      if (buffer.byteLength > bestBytes) {
        bestBytes = buffer.byteLength;
        longestPath = stored;
      }
    }

    // Prefer natural professional/open speech for clone reference.
    const referencePath =
      pathByLabel.professional || pathByLabel.open || pathByLabel.reading || longestPath;

    const identityProfile = await buildIdentityProfile({
      gender,
      openPrompt,
      transcriptByLabel,
      durations: Object.fromEntries(
        ALL_REQUIRED_SLOTS.map((id) => [id, byLabel.get(id)?.duration || 0]),
      ),
    });

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
        conversationJson: JSON.stringify(identityProfile),
        ttsVoice,
      },
      create: {
        userId: user.id,
        consentAt: new Date(),
        gender,
        referencePath,
        cloneReady: Boolean(referencePath),
        conversationJson: JSON.stringify(identityProfile),
        ttsVoice,
      },
    });

    return NextResponse.json({
      ok: true,
      voiceProfile,
      identityProfile,
      conversation: identityProfile.conversation_profile,
      transcripts: transcriptByLabel,
      samples: ALL_REQUIRED_SLOTS.length,
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

async function buildIdentityProfile(input: {
  gender: string;
  openPrompt: string;
  transcriptByLabel: Record<string, string>;
  durations: Record<string, number>;
}): Promise<IdentityProfile> {
  const t = input.transcriptByLabel;
  const d = input.durations;

  const recruiterBlock = [
    `Q: Tell me about yourself.\nA (${d["recruiter-self"] || 0}s): ${t["recruiter-self"] || ""}`,
    `Q: Why are you looking for a new role?\nA (${d["recruiter-why"] || 0}s): ${t["recruiter-why"] || ""}`,
    `Q: What are your salary expectations?\nA (${d["recruiter-salary"] || 0}s): ${t["recruiter-salary"] || ""}`,
    `Q: Are you open to relocation?\nA (${d["recruiter-reloc"] || 0}s): ${t["recruiter-reloc"] || ""}`,
  ].join("\n\n");

  const parsed = await geminiJson<{
    speech_profile: IdentityProfile["speech_profile"];
    conversation_profile: IdentityProfile["conversation_profile"];
    professional_profile: IdentityProfile["professional_profile"];
    recruiter_answer_profile: IdentityProfile["recruiter_answer_profile"];
  }>(
    `You are building a Professional Identity Clone for Verba — so Cherry can sound like THIS candidate on recruiter screens, not like a generic AI.

Analyze each task separately.

TASK 1 — Reading passage (pronunciation / speed / accent):
${t.reading || "(empty)"}

TASK 2 — Professional recruiter passage (screen voice):
${t.professional || "(empty)"}

TASK 3 — Open conversation (prompt: ${input.openPrompt || "n/a"}):
Duration ${d.open || 0}s
${t.open || "(empty)"}

TASK 4 — Natural recruiter answers:
${recruiterBlock}

Return JSON only with this exact shape:
{
  "speech_profile": {
    "pace": "slow|medium|fast",
    "clarity": "mumbled|clear|very_clear",
    "accent_notes": "short note on accent/region if audible from wording rhythm, else unknown",
    "pronunciation_notes": "how they handle numbers, names, technical terms"
  },
  "conversation_profile": {
    "formality": "casual|professional|formal",
    "answerLength": "short|medium|long",
    "typicalPhrases": ["up to 10 real phrases/fillers from the open + recruiter answers"],
    "energy": "low|steady|high",
    "pause_style": "few pauses|natural pauses|long thoughtful pauses",
    "notes": "3 sentences on pacing, sentence structure, confidence, and energy from Task 3"
  },
  "professional_profile": {
    "screen_tone": "warm|neutral|crisp",
    "confidence": "hesitant|steady|assertive",
    "structure": "rambling|conversational|tight",
    "notes": "2 sentences on how they sound in Task 2 professional reading"
  },
  "recruiter_answer_profile": {
    "typical_answer_length": "short|medium|long",
    "formality": "casual|professional|formal",
    "confidence": "hesitant|steady|assertive",
    "favorite_phrases": ["phrases they actually used in Task 4"],
    "how_they_open": "how they typically start an answer",
    "notes": "3 sentences: answer length habits, formality, confidence, and what Cherry must mirror on screens"
  }
}

Be specific to THESE transcripts. Do not invent a corporate persona.`,
  );

  const conversation = parsed.conversation_profile || {
    formality: "professional",
    answerLength: "medium",
    typicalPhrases: [],
    energy: "steady",
    pause_style: "natural pauses",
    notes: "Sound like a real candidate on a phone screen.",
  };
  const recruiter = parsed.recruiter_answer_profile || {
    typical_answer_length: conversation.answerLength,
    formality: conversation.formality,
    confidence: "steady",
    favorite_phrases: conversation.typicalPhrases || [],
    how_they_open: "Lead with the point.",
    notes: conversation.notes,
  };
  const speech = parsed.speech_profile || {
    pace: "medium",
    clarity: "clear",
    accent_notes: "unknown",
    pronunciation_notes: "Clear enough for a phone screen.",
  };
  const professional = parsed.professional_profile || {
    screen_tone: "warm",
    confidence: recruiter.confidence,
    structure: "conversational",
    notes: "Professional phone tone.",
  };

  const phrases = Array.from(
    new Set([...(conversation.typicalPhrases || []), ...(recruiter.favorite_phrases || [])]),
  ).slice(0, 12);

  const notes = [
    recruiter.notes,
    conversation.notes,
    professional.notes,
    `Speech: ${speech.pace} pace, ${speech.clarity}. ${speech.pronunciation_notes}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    voice_profile: {
      gender: input.gender,
      clone_ready: true,
      notes: "Reference audio taken from training recordings for clone / TTS matching.",
    },
    speech_profile: speech,
    conversation_profile: { ...conversation, typicalPhrases: phrases },
    professional_profile: professional,
    recruiter_answer_profile: recruiter,
    formality: recruiter.formality || conversation.formality,
    answerLength: recruiter.typical_answer_length || conversation.answerLength,
    typicalPhrases: phrases,
    notes,
  };
}

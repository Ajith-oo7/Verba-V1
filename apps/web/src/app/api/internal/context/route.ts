import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildProfileCard, firstNameOf, estimateYearsExperience } from "@/lib/profile";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-verba-internal") !== process.env.INTERNAL_API_SECRET) {
    return unauthorized();
  }
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      voiceProfile: true,
      preferences: { orderBy: { sortOrder: "asc" } },
      voiceSamples: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });
  if (!user?.profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const conversation = safeParse(user.voiceProfile?.conversationJson || "{}", {});
  const experience = safeParseArray(user.profile.experienceJson);
  const skills = safeParseArray(user.profile.skillsJson);
  const education = safeParseArray(user.profile.educationJson);
  const years = estimateYearsExperience(user.profile.resumeText, experience);

  const voiceTranscripts = user.voiceSamples
    .filter((sample) => sample.transcript?.trim())
    .slice(0, 8)
    .map((sample) => {
      const base = sample.path.split(/[/\\]/).pop() || "";
      const label = base.split("-")[0] || "sample";
      return `[${label}] ${sample.transcript.trim()}`;
    });

  return NextResponse.json({
    userId: user.id,
    fullName: user.profile.fullName || user.name,
    firstName: firstNameOf(user.profile.fullName || user.name),
    gender: user.voiceProfile?.gender || "unknown",
    referencePath: user.voiceProfile?.referencePath || "",
    elevenLabsVoiceId: user.voiceProfile?.elevenLabsVoiceId || "",
    conversationProfile: conversation,
    preferences: user.preferences.map((item) => ({ question: item.question, answer: item.answer })),
    profileCard: buildProfileCard(user.profile),
    yearsExperience: years,
    experience,
    skills,
    education,
    voiceTranscripts,
    resumeText: (user.profile.resumeText || "").slice(0, 2500),
    salaryMin: user.profile.salaryMin,
    salaryMax: user.profile.salaryMax,
  });
}

function safeParse(raw: string, fallback: Record<string, unknown>) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeParseArray(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

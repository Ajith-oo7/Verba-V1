import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { ensureDir, resumeDir } from "@/lib/storage";
import path from "path";
import fs from "fs/promises";

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

const saveSchema = z.object({
  fullName: z.string().min(1),
  headline: z.string().optional().default(""),
  location: z.string().optional().default(""),
  linkedinUrl: z.string().optional().default(""),
  portfolioUrl: z.string().optional().default(""),
  workAuthorization: z.string().optional().default(""),
  requiresSponsorship: z.boolean().optional().default(false),
  salaryMin: z.number().nullable().optional(),
  salaryMax: z.number().nullable().optional(),
  salaryCurrency: z.string().optional().default("USD"),
  startDate: z.string().optional().default(""),
  openToRelocation: z.boolean().optional().default(false),
  openToHybrid: z.boolean().optional().default(true),
  openToRemote: z.boolean().optional().default(true),
  availability: z.string().optional().default(""),
  skillsJson: z.string().optional(),
  experienceJson: z.string().optional(),
  educationJson: z.string().optional(),
  certificationsJson: z.string().optional(),
  resumeText: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("resume");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Upload a PDF resume." }, { status: 400 });
      }
      if (file.size > MAX_RESUME_BYTES) {
        return NextResponse.json({ error: "Resume must be under 8 MB." }, { status: 400 });
      }
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const dir = await ensureDir(resumeDir());
      const stored = path.join(dir, `${user.id}.pdf`);
      await fs.writeFile(stored, buffer);

      const extracted = await geminiJson<{
        fullName: string;
        headline: string;
        location: string;
        linkedinUrl: string;
        workAuthorization: string;
        skills: string[];
        experience: Array<Record<string, string>>;
        education: Array<Record<string, string>>;
        certifications: string[];
        resumeText: string;
      }>(
        `Extract a structured professional profile from this resume PDF.
Return JSON with keys: fullName, headline, location, linkedinUrl, workAuthorization, skills (string array), experience (array of {title, company, dates, summary}), education (array of {school, degree, dates}), certifications (string array), resumeText (plain text of the resume).
If a field is unknown, use an empty string or empty array. Do not invent employers or dates.`,
        { pdfBase64: buffer.toString("base64") },
      );

      const profile = await prisma.profile.upsert({
        where: { userId: user.id },
        update: {
          fullName: extracted.fullName || user.name,
          headline: extracted.headline || "",
          location: extracted.location || "",
          linkedinUrl: extracted.linkedinUrl || "",
          workAuthorization: extracted.workAuthorization || "",
          skillsJson: JSON.stringify(extracted.skills || []),
          experienceJson: JSON.stringify(extracted.experience || []),
          educationJson: JSON.stringify(extracted.education || []),
          certificationsJson: JSON.stringify(extracted.certifications || []),
          resumeText: extracted.resumeText || "",
          resumePath: stored,
        },
        create: {
          userId: user.id,
          fullName: extracted.fullName || user.name,
          headline: extracted.headline || "",
          resumePath: stored,
          skillsJson: JSON.stringify(extracted.skills || []),
          experienceJson: JSON.stringify(extracted.experience || []),
          educationJson: JSON.stringify(extracted.education || []),
          certificationsJson: JSON.stringify(extracted.certifications || []),
          resumeText: extracted.resumeText || "",
        },
      });
      return NextResponse.json({ profile: extracted, saved: profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse the resume.";
      console.error("Resume parse failed:", message);
      return NextResponse.json(
        { error: `Resume parse failed: ${message}. You can still fill the form manually and save.` },
        { status: 502 },
      );
    }
  }

  try {
    const body = saveSchema.parse(await req.json());
    if (body.salaryMin != null && Number.isNaN(body.salaryMin)) {
      return NextResponse.json({ error: "Salary min must be a number." }, { status: 400 });
    }
    if (body.salaryMax != null && Number.isNaN(body.salaryMax)) {
      return NextResponse.json({ error: "Salary max must be a number." }, { status: 400 });
    }

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        fullName: body.fullName,
        headline: body.headline,
        location: body.location,
        linkedinUrl: body.linkedinUrl,
        portfolioUrl: body.portfolioUrl,
        workAuthorization: body.workAuthorization,
        requiresSponsorship: body.requiresSponsorship,
        salaryMin: body.salaryMin ?? null,
        salaryMax: body.salaryMax ?? null,
        salaryCurrency: body.salaryCurrency,
        startDate: body.startDate,
        openToRelocation: body.openToRelocation,
        openToHybrid: body.openToHybrid,
        openToRemote: body.openToRemote,
        availability: body.availability,
        ...(body.skillsJson !== undefined ? { skillsJson: body.skillsJson } : {}),
        ...(body.experienceJson !== undefined ? { experienceJson: body.experienceJson } : {}),
        ...(body.educationJson !== undefined ? { educationJson: body.educationJson } : {}),
        ...(body.certificationsJson !== undefined ? { certificationsJson: body.certificationsJson } : {}),
        ...(body.resumeText !== undefined ? { resumeText: body.resumeText } : {}),
      },
      create: {
        userId: user.id,
        fullName: body.fullName,
        headline: body.headline,
        location: body.location,
        linkedinUrl: body.linkedinUrl,
        portfolioUrl: body.portfolioUrl,
        workAuthorization: body.workAuthorization,
        requiresSponsorship: body.requiresSponsorship,
        salaryMin: body.salaryMin ?? null,
        salaryMax: body.salaryMax ?? null,
        salaryCurrency: body.salaryCurrency,
        startDate: body.startDate,
        openToRelocation: body.openToRelocation,
        openToHybrid: body.openToHybrid,
        openToRemote: body.openToRemote,
        availability: body.availability,
        skillsJson: body.skillsJson ?? "[]",
        experienceJson: body.experienceJson ?? "[]",
        educationJson: body.educationJson ?? "[]",
        certificationsJson: body.certificationsJson ?? "[]",
        resumeText: body.resumeText ?? "",
      },
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Check the profile fields and try again." },
        { status: 400 },
      );
    }
    console.error("Profile save failed:", error);
    return NextResponse.json({ error: "Could not save profile." }, { status: 500 });
  }
}

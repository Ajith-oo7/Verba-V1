import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { DEFAULT_PREFERENCES } from "@/lib/profile";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(80),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 400 });
    }
    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        profile: { create: { fullName: body.name.trim() } },
        voiceProfile: { create: {} },
        preferences: {
          create: DEFAULT_PREFERENCES.map((item, index) => ({
            question: item.question,
            answer: item.answer,
            sortOrder: index,
          })),
        },
      },
    });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Check name, email, and a password of at least 8 characters." },
        { status: 400 },
      );
    }
    throw error;
  }
}

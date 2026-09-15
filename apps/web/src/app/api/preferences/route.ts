import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({
  preferences: z.array(
    z.object({
      id: z.string().optional(),
      question: z.string().min(3),
      answer: z.string().min(3),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const body = schema.parse(await req.json());
    await prisma.preference.deleteMany({ where: { userId: user.id } });
    await prisma.preference.createMany({
      data: body.preferences.map((item, index) => ({
        userId: user.id,
        question: item.question.trim(),
        answer: item.answer.trim(),
        sortOrder: index,
      })),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Each preference needs a question and answer." }, { status: 400 });
    }
    console.error("Preferences save failed:", error);
    return NextResponse.json({ error: "Could not save answers." }, { status: 500 });
  }
}

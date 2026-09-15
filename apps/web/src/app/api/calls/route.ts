import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const calls = await prisma.call.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 40,
  });
  return NextResponse.json({ calls });
}

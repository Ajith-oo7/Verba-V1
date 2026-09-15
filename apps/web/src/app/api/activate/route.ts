import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const body = await req.json();
    const cherryActive = Boolean(body.cherryActive);
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { cherryActive },
      create: { userId: user.id, fullName: user.name, cherryActive },
    });
    return NextResponse.json({ ok: true, cherryActive });
  } catch (error) {
    console.error("Activate failed:", error);
    return NextResponse.json({ error: "Could not update Cherry." }, { status: 500 });
  }
}

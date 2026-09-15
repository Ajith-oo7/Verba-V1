import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await context.params;
  const sample = await prisma.voiceSample.findFirst({
    where: { id, userId: user.id },
  });
  if (!sample) return NextResponse.json({ error: "Sample not found." }, { status: 404 });

  try {
    const data = await fs.readFile(sample.path);
    const ext = path.extname(sample.path).toLowerCase();
    const type =
      ext === ".wav"
        ? "audio/wav"
        : ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".ogg"
            ? "audio/ogg"
            : "audio/webm";
    return new NextResponse(data, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio file missing on disk." }, { status: 404 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-verba-internal") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roomName = req.nextUrl.searchParams.get("roomName");
  if (!roomName) return NextResponse.json({ error: "roomName required" }, { status: 400 });

  const call = await prisma.call.findFirst({
    where: { roomName },
    orderBy: { startedAt: "desc" },
  });
  if (!call) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  return NextResponse.json({
    userId: call.userId,
    callId: call.id,
    mode: call.mode,
    roomName: call.roomName,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createParticipantToken, roomService } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const rawMode = String(body.mode || "edit");
    const mode =
      rawMode === "simulator"
        ? "simulator"
        : rawMode === "practice"
          ? "practice"
          : rawMode === "listen"
            ? "listen"
            : "edit";

    const call = await prisma.call.create({
      data: {
        userId: user.id,
        mode,
        roomName: "",
        status: "active",
      },
    });

    const roomName = `verba-${mode}-${user.id.slice(0, 8)}-${call.id.slice(0, 8)}`;
    await prisma.call.update({ where: { id: call.id }, data: { roomName } });

    const metadata = JSON.stringify({ userId: user.id, callId: call.id, mode });
    const rooms = roomService();
    try {
      await rooms.createRoom({
        name: roomName,
        emptyTimeout: 60 * 20,
        metadata,
      });
    } catch {
      // Room may already exist from a race; force metadata.
    }
    try {
      await rooms.updateRoomMetadata(roomName, metadata);
    } catch (error) {
      console.error("updateRoomMetadata failed:", error);
    }

    const token = await createParticipantToken(`user-${user.id}`, roomName, user.name, {
      userId: user.id,
      callId: call.id,
      mode,
    });

    return NextResponse.json({
      token,
      url: process.env.LIVEKIT_URL,
      roomName,
      callId: call.id,
      mode,
    });
  } catch (error) {
    console.error("LiveKit token failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Cherry session." },
      { status: 500 },
    );
  }
}

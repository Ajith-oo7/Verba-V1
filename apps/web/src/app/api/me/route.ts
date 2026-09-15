import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({
    name: user.name,
    email: user.email,
    profile: user.profile,
    voiceProfile: user.voiceProfile,
    preferences: user.preferences,
  });
}

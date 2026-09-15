import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function creds() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error("LiveKit env is missing");
  return { url, apiKey, apiSecret };
}

export function livekitHttpUrl() {
  return creds().url.replace(/^ws/, "http");
}

export function roomService() {
  const { apiKey, apiSecret } = creds();
  return new RoomServiceClient(livekitHttpUrl(), apiKey, apiSecret);
}

export async function createParticipantToken(
  identity: string,
  room: string,
  name: string,
  metadata?: Record<string, string>,
) {
  const { apiKey, apiSecret } = creds();
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: "20m",
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}

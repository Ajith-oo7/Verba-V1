import fs from "fs/promises";
import path from "path";

function apiKey() {
  return (
    process.env.ELEVEN_LABS_KEY ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVEN_API_KEY ||
    ""
  ).trim();
}

export function elevenLabsConfigured() {
  if (process.env.ELEVEN_SKIP_CLONE?.trim().toLowerCase() === "1") return false;
  if (["true", "yes"].includes((process.env.ELEVEN_SKIP_CLONE || "").trim().toLowerCase())) {
    return false;
  }
  return Boolean(apiKey());
}

/** Instant Voice Clone from one or more local audio files. Returns ElevenLabs voice_id. */
export async function createElevenLabsClone(input: {
  name: string;
  filePaths: string[];
  description?: string;
  removeBackgroundNoise?: boolean;
}): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("ELEVEN_LABS_KEY is missing.");

  const files = input.filePaths.filter(Boolean);
  if (!files.length) throw new Error("No audio files for ElevenLabs clone.");

  const form = new FormData();
  form.append("name", input.name.slice(0, 100) || "Verba clone");
  form.append("description", input.description || "Verba Cherry professional identity clone");
  form.append("remove_background_noise", String(Boolean(input.removeBackgroundNoise)));

  for (const filePath of files) {
    const buffer = await fs.readFile(filePath);
    const name = path.basename(filePath);
    const type = mimeFor(name);
    form.append("files", new Blob([new Uint8Array(buffer)], { type }), name);
  }

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": key, Accept: "application/json" },
    body: form,
  });

  const data = (await response.json().catch(() => ({}))) as {
    voice_id?: string;
    detail?: { status?: string; message?: string } | string;
  };

  if (!response.ok || !data.voice_id) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : data.detail?.message || JSON.stringify(data);
    throw new Error(`ElevenLabs clone failed (${response.status}): ${detail}`);
  }

  return data.voice_id;
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  const key = apiKey();
  if (!key || !voiceId) return;
  try {
    await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: { "xi-api-key": key, Accept: "application/json" },
    });
  } catch (error) {
    console.warn("Failed to delete previous ElevenLabs voice:", error);
  }
}

function mimeFor(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".m4a") return "audio/mp4";
  return "audio/webm";
}

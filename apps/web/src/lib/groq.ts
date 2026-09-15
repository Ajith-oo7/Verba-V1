import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

export function groqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is missing");
  return new Groq({ apiKey: key });
}

export async function transcribeFile(filePath: string) {
  const groq = groqClient();
  const file = fs.createReadStream(filePath);
  const result = await groq.audio.transcriptions.create({
    file: await toFile(filePath, file),
    model: "whisper-large-v3-turbo",
    language: "en",
  });
  return result.text?.trim() || "";
}

async function toFile(filePath: string, stream: fs.ReadStream) {
  const blob = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
  const name = path.basename(filePath);
  const type = name.endsWith(".wav") ? "audio/wav" : name.endsWith(".mp3") ? "audio/mpeg" : "audio/webm";
  return new File([blob], name, { type });
}

import path from "path";
import fs from "fs/promises";

export const ROOT_DATA = path.resolve(process.cwd(), "../../data");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function resumeDir() {
  return path.join(ROOT_DATA, "resumes");
}

export function voiceDir() {
  return path.join(ROOT_DATA, "voices");
}

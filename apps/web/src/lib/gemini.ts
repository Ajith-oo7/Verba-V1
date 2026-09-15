import { GoogleGenAI } from "@google/genai";

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing");
  return new GoogleGenAI({ apiKey: key });
}

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/"message"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
    return error.message;
  }
  return "Gemini request failed";
}

export async function geminiJson<T>(prompt: string, extra?: { pdfBase64?: string }): Promise<T> {
  const ai = client();
  const errors: string[] = [];
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (extra?.pdfBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "application/pdf",
        data: extra.pdfBase64,
      },
    });
  }

  for (const model of MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { responseMimeType: "application/json" },
        }),
        TIMEOUT_MS,
        model,
      );
      const text = response.text;
      if (!text) throw new Error("Empty Gemini response");
      return JSON.parse(stripFence(text)) as T;
    } catch (error) {
      errors.push(`${model}: ${errorMessage(error)}`);
    }
  }
  throw new Error(errors.join(" | ") || "Gemini request failed");
}

function stripFence(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

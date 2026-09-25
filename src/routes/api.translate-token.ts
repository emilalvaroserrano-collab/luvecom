import fs from "node:fs";
import { GoogleGenAI, Modality } from "@google/genai";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TRANSLATION_LANGUAGE_CODES } from "@/lib/translation-languages";

const MODEL = "models/gemini-3.5-live-translate-preview";
const requestSchema = z.object({
  targetLanguageCode: z.string().refine((code) => TRANSLATION_LANGUAGE_CODES.has(code)),
});

function getGeminiApiKey(): string | undefined {
  let key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key.startsWith("MY_")) {
    try {
      if (fs.existsSync("/tmp/.gemini_key")) {
        const fileKey = fs.readFileSync("/tmp/.gemini_key", "utf8").trim();
        if (fileKey && !fileKey.startsWith("MY_")) {
          key = fileKey;
        }
      }
    } catch {
      // Fallback
    }
  }
  return key || undefined;
}

export const Route = createFileRoute("/api/translate-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          return Response.json(
            { error: "Live translation is not configured yet. Set GEMINI_API_KEY." },
            { status: 503 },
          );
        }

        try {
          const body = requestSchema.parse(await request.json());
          const ai = new GoogleGenAI({ apiKey });
          const now = Date.now();
          const token = await ai.authTokens.create({
            config: {
              uses: 10,
              expireTime: new Date(now + 60 * 60 * 1000).toISOString(),
              newSessionExpireTime: new Date(now + 10 * 60 * 1000).toISOString(),
              liveConnectConstraints: {
                model: MODEL,
                config: {
                  responseModalities: [Modality.AUDIO],
                  translationConfig: {
                    targetLanguageCode: body.targetLanguageCode,
                    echoTargetLanguage: true,
                  },
                },
              },
            },
          });

          if (!token.name) {
            return Response.json(
              { error: "Translation could not start. Please try again." },
              { status: 502 },
            );
          }

          return Response.json({ token: token.name, model: MODEL });
        } catch (error) {
          console.error("Translate token error:", error);
          if (error instanceof z.ZodError) {
            return Response.json({ error: "Choose a supported language." }, { status: 400 });
          }
          const message = error instanceof Error ? error.message : "Translation could not start. Please try again.";
          return Response.json(
            { error: message },
            { status: 502 },
          );
        }
      },
    },
  },
});

import OpenAI from "openai";

import { requireEnv } from "@/lib/env";

export function createAgentClient() {
  return new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
  });
}

export const defaultAgentModel = process.env.OPENAI_MODEL ?? "gpt-5.2";

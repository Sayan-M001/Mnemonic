import { ensureLocalEnvLoaded } from "./env.js";

type JsonObject = Record<string, unknown>;

export type AIClientResult<T> = {
  data: T;
  model: string;
};

export function getAIClientConfig() {
  ensureLocalEnvLoaded();
  const apiKey = process.env.MNEMONIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.MNEMONIC_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.MNEMONIC_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  return {
    apiKey,
    baseUrl,
    model,
    enabled: Boolean(apiKey)
  };
}

export async function requestJsonFromModel<T>({
  systemPrompt,
  userPrompt,
  maxOutputTokens = 1400
}: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<AIClientResult<T>> {
  const config = getAIClientConfig();
  if (!config.apiKey) {
    throw new Error("No OpenAI API key configured. Set MNEMONIC_OPENAI_API_KEY or OPENAI_API_KEY.");
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }]
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      },
      max_output_tokens: maxOutputTokens
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as JsonObject;
  const text = extractOutputText(payload);
  if (!text) {
    throw new Error("Model returned no text output.");
  }

  return {
    data: JSON.parse(text) as T,
    model: config.model
  };
}

function extractOutputText(payload: JsonObject): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Array.isArray((item as JsonObject).content) ? ((item as JsonObject).content as unknown[]) : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const textValue = (part as JsonObject).text;
      if (typeof textValue === "string") {
        chunks.push(textValue);
      }
    }
  }

  return chunks.join("").trim();
}

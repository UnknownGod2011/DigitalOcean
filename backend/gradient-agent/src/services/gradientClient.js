/**
 * gradientClient.js
 * DigitalOcean Gradient AI — OpenAI-compatible client factory.
 *
 * All model calls go through https://inference.do-ai.run/v1/
 * using the MODEL_ACCESS_KEY from the DO Control Panel.
 *
 * Get your key at:
 *   https://cloud.digitalocean.com/agent-platform/serverless-inference
 *   → Serverless Inference → Model Access Keys → Create Access Key
 */

import OpenAI from "openai";

// ── Model IDs (override via .env) ─────────────────────────────────────────────
// Text model: used for all text reasoning, intent routing, action planning
export const TEXT_MODEL_ID =
  process.env.GRADIENT_TEXT_MODEL ||
  "anthropic-claude-4.5-haiku";

// Vision model: used for image + multimodal inputs
export const VISION_MODEL_ID =
  process.env.GRADIENT_VISION_MODEL ||
  "openai-gpt-4o";

// Embedding model: used for semantic ranking
export const EMBED_MODEL_ID =
  process.env.GRADIENT_EMBEDDING_MODEL ||
  "gte-large-v1.5";

const DO_BASE_URL =
  process.env.GRADIENT_BASE_URL || "https://inference.do-ai.run/v1/";

// ── Singleton client ──────────────────────────────────────────────────────────
let _client = null;

export function getGradientClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.MODEL_ACCESS_KEY || "",
      baseURL: DO_BASE_URL
    });
  }
  return _client;
}

export function hasConfiguredCredentials() {
  return Boolean(process.env.MODEL_ACCESS_KEY && process.env.MODEL_ACCESS_KEY.trim());
}

/**
 * Core chat completion helper.
 * Supports text-only and vision (image_url) messages.
 *
 * @param {object} opts
 * @param {string}  [opts.prompt]       - Simple text prompt (text-only)
 * @param {Array}   [opts.messages]     - Full messages array (multimodal / pre-built)
 * @param {string}  [opts.systemText]   - System instruction (prepended if messages not provided)
 * @param {string}  [opts.model]        - Model ID override
 * @param {number}  [opts.temperature]  - 0.0–1.0
 * @param {number}  [opts.maxTokens]    - Max output tokens
 * @returns {{ text: string, model: string, latencyMs: number, usage?: object }}
 */
export async function callGradient({
  prompt,
  messages,
  systemText,
  model = TEXT_MODEL_ID,
  temperature = 0.7,
  maxTokens = 2048
}) {
  const client = getGradientClient();
  const startedAt = Date.now();

  let builtMessages;

  if (messages) {
    // If messages already include a system message, use as-is.
    // Otherwise prepend systemText if provided.
    const hasSystem = messages.some(m => m.role === "system");
    if (systemText && !hasSystem) {
      builtMessages = [{ role: "system", content: systemText }, ...messages];
    } else {
      builtMessages = messages;
    }
  } else {
    builtMessages = [];
    if (systemText) builtMessages.push({ role: "system", content: systemText });
    builtMessages.push({ role: "user", content: prompt ?? "" });
  }

  const response = await client.chat.completions.create({
    model,
    messages: builtMessages,
    max_completion_tokens: maxTokens,
    temperature
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Gradient AI returned no text result.");

  const usage = response.usage
    ? {
        inputTokens: response.usage.prompt_tokens ?? 0,
        outputTokens: response.usage.completion_tokens ?? 0
      }
    : undefined;

  return { text, model: response.model || model, latencyMs: Date.now() - startedAt, usage };
}

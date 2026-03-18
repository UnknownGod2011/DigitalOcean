/**
 * gradientService.js
 * DigitalOcean Gradient AI service layer.
 * Exports the same three factory functions app.js expects:
 *   createGradientTextGenerator()
 *   createGradientIntentRouter()
 *   createGradientOptionGenerator()
 */

import {
  callGradient,
  hasConfiguredCredentials,
  TEXT_MODEL_ID,
  VISION_MODEL_ID
} from "./services/gradientClient.js";
import {
  buildIntentRouterPrompt,
  inferUsefulCodeAction,
  inferFallbackType,
  normalizeActionHint,
  normalizeIntentDecision
} from "./contentClassifier.js";

// ── System instructions ───────────────────────────────────────────────────────
const EXECUTION_SYSTEM = [
  "You are Cursivis, a cursor-native AI assistant.",
  "Selection is the context, trigger press is the user's intent.",
  "Return the most useful result for that selection.",
  "Honor the chosen action when provided, but execute it intelligently.",
  "Be decisive, concise, and useful by default.",
  "Do not output internal reasoning or generic advice unless explicitly asked.",
  "If content is time-sensitive, use grounded facts and include an explicit date."
].join(" ");

const INTENT_ROUTER_SYSTEM = [
  "You are the Cursivis intent router.",
  "Infer the most useful action from the user's current selection.",
  "First identify the content type, then infer likely user intent, then choose the single best action.",
  "Prefer usefulness over rigid labels.",
  "Return strict JSON only — no markdown, no commentary."
].join(" ");

const DYNAMIC_OPTIONS_SYSTEM = [
  "You generate additional action options for Guided Mode in Cursivis.",
  "Start from the selected content, infer what other useful operations a user may want next.",
  "Return only practical, concise, executable follow-up actions.",
  "Do not repeat existing options.",
  "Return strict JSON only."
].join(" ");

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 200;

function readCache(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.value;
}

function writeCache(cache, key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ── JSON parser ───────────────────────────────────────────────────────────────
function parseJsonObject(raw) {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(candidate.slice(s, e + 1)); } catch { return null; }
}

function parseActionListFromJson(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.extraActions) ? raw.extraActions
    : Array.isArray(raw?.actions) ? raw.actions
    : Array.isArray(raw?.alternatives) ? raw.alternatives
    : [];
  return arr
    .map(v => normalizeActionHint(String(v)))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

// ── Build OpenAI vision messages ──────────────────────────────────────────────
function buildVisionMessages({ text, imageBase64, imageMimeType, systemText }) {
  const messages = [];
  if (systemText) messages.push({ role: "system", content: systemText });
  const content = [];
  if (text) content.push({ type: "text", text });
  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${imageMimeType || "image/png"};base64,${imageBase64}` }
    });
  }
  messages.push({ role: "user", content });
  return messages;
}

// ── Fallback intent ───────────────────────────────────────────────────────────
function fallbackIntentDecision({ selectionKind, text }) {
  if (selectionKind === "image") {
    return {
      contentType: "image",
      bestAction: "describe_image",
      confidence: 0.7,
      alternatives: ["describe_image", "extract_key_details", "identify_objects", "extract_dominant_colors"]
    };
  }
  const contentType = inferFallbackType(text || "");
  const bestAction = contentType === "code" ? inferUsefulCodeAction(text || "") : null;
  return normalizeIntentDecision({ contentType, bestAction, confidence: 0.7, alternatives: [] }, text || "");
}

// ── Text Generator ────────────────────────────────────────────────────────────
export function createGradientTextGenerator({ model = TEXT_MODEL_ID } = {}) {
  if (!hasConfiguredCredentials()) {
    return async () => { throw new Error("MODEL_ACCESS_KEY is required to call DigitalOcean Gradient AI."); };
  }

  const cache = new Map();

  return async ({ prompt, contents, selectionType, action, text, config = {} }) => {
    const startedAt = Date.now();
    const resolvedModel = config.modelOverride || model;

    const systemText = [
      EXECUTION_SYSTEM,
      `Detected content type: ${selectionType || "general_text"}.`,
      `Chosen action: ${action || "summarize"}.`,
      "Return only the final user-facing result."
    ].join(" ");

    const cacheKey = typeof prompt === "string" && prompt.trim() && prompt.length <= 12000
      ? JSON.stringify({ model: resolvedModel, prompt, temperature: config.temperature ?? 0.7 })
      : null;

    const cached = cacheKey ? readCache(cache, cacheKey) : null;
    if (cached) return { ...cached, latencyMs: Math.max(1, Date.now() - startedAt), cached: true };

    let result;

    // Multimodal path: contents is an OpenAI messages array with image_url blocks
    if (contents) {
      const convertedMessages = contents.map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        const newContent = msg.content.map(block => {
          // Normalize any legacy image block format to OpenAI image_url
          if (block.image?.source?.bytes) {
            const mimeType = block.image.format ? `image/${block.image.format}` : "image/png";
            const b64 = Buffer.isBuffer(block.image.source.bytes)
              ? block.image.source.bytes.toString("base64")
              : Buffer.from(block.image.source.bytes).toString("base64");
            return { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } };
          }
          if (block.text) return { type: "text", text: block.text };
          return block;
        });
        return { role: msg.role, content: newContent };
      });

      const messages = [{ role: "system", content: systemText }, ...convertedMessages];
      result = await callGradient({ messages, model: VISION_MODEL_ID, temperature: config.temperature ?? 0.7 });
    } else {
      result = await callGradient({ prompt, systemText, model: resolvedModel, temperature: config.temperature ?? 0.7 });
    }

    if (cacheKey) writeCache(cache, cacheKey, result);
    return result;
  };
}

// ── Intent Router ─────────────────────────────────────────────────────────────
export function createGradientIntentRouter({ model = TEXT_MODEL_ID } = {}) {
  if (!hasConfiguredCredentials()) {
    return async ({ selectionKind = "text", text = "" }) => fallbackIntentDecision({ selectionKind, text });
  }

  const cache = new Map();

  return async ({
    selectionKind = "text",
    text = "",
    imageBase64 = "",
    imageMimeType = "image/png",
    mode = "smart",
    actionHint = "",
    voiceCommand = ""
  }) => {
    const startedAt = Date.now();
    const cacheKey = selectionKind === "text" && text.trim()
      ? `intent:${mode}:${actionHint}:${voiceCommand}:${text.trim().slice(0, 9000)}`
      : null;
    const cached = cacheKey ? readCache(cache, cacheKey) : null;
    if (cached) return { ...cached, latencyMs: Math.max(1, Date.now() - startedAt), cached: true };

    try {
      let result;

      if ((selectionKind === "image" || selectionKind === "text_image") && imageBase64) {
        const promptText = selectionKind === "image"
          ? [
              "You are the Cursivis image intent router.",
              "Analyze the image and decide the most useful next AI action.",
              "Return strict JSON only:",
              JSON.stringify({ contentType: "image", bestAction: "snake_case action", confidence: 0.0, alternatives: ["3-8 actions"] }, null, 2),
              `Mode: ${mode}`, `Action hint: ${actionHint || "none"}`, `Voice command: ${voiceCommand || "none"}`
            ].join("\n\n")
          : [
              "You are the Cursivis multimodal intent router.",
              "Use the text as primary context and the screenshot as supporting context.",
              "Return strict JSON only:",
              JSON.stringify({ contentType: "question|code|email|general_text", bestAction: "snake_case", confidence: 0.0, alternatives: ["3-8 actions"] }, null, 2),
              `Mode: ${mode}`, `Action hint: ${actionHint || "none"}`, `Voice command: ${voiceCommand || "none"}`,
              "Selected text:", text.trim().slice(0, 7000)
            ].join("\n\n");

        const messages = buildVisionMessages({ text: promptText, imageBase64, imageMimeType, systemText: INTENT_ROUTER_SYSTEM });
        result = await callGradient({ messages, model: VISION_MODEL_ID, temperature: 0.1 });
      } else {
        result = await callGradient({
          prompt: buildIntentRouterPrompt({ text, mode, actionHint, voiceCommand }),
          systemText: INTENT_ROUTER_SYSTEM,
          model,
          temperature: 0.1
        });
      }

      const parsed = parseJsonObject(result.text);
      const normalized = selectionKind === "image" ? { ...(parsed || {}), contentType: "image" } : parsed;
      const decision = {
        ...normalizeIntentDecision(normalized, text),
        latencyMs: Date.now() - startedAt,
        model: result.model
      };

      if (cacheKey) writeCache(cache, cacheKey, decision);
      return decision;
    } catch {
      return { ...fallbackIntentDecision({ selectionKind, text }), latencyMs: Date.now() - startedAt };
    }
  };
}

// ── Option Generator ──────────────────────────────────────────────────────────
export function createGradientOptionGenerator({ model = TEXT_MODEL_ID } = {}) {
  if (!hasConfiguredCredentials()) return async () => [];

  const cache = new Map();

  return async ({
    selectionKind = "text",
    text = "",
    imageBase64 = "",
    imageMimeType = "image/png",
    contentType = "general_text",
    currentOptions = []
  }) => {
    const normalizedCurrent = currentOptions.map(v => normalizeActionHint(String(v))).filter(Boolean);
    const cacheKey = selectionKind === "text" && text.trim()
      ? `options:${contentType}:${normalizedCurrent.join(",")}:${text.trim().slice(0, 6000)}`
      : null;
    const cached = cacheKey ? readCache(cache, cacheKey) : null;
    if (cached) return cached;

    try {
      const optionsPrompt = [
        "You generate additional executable action options for a contextual AI menu.",
        "Return strict JSON only:",
        JSON.stringify({ extraActions: ["3-8 new snake_case action names, different from current options"] }, null, 2),
        `Content type: ${contentType}`,
        `Current options: ${normalizedCurrent.join(", ") || "none"}`,
        "Rules: Do not repeat existing options. Keep actions concise and executable.",
        selectionKind !== "image" ? `Selection text:\n${text.trim().slice(0, 7000)}` : ""
      ].filter(Boolean).join("\n\n");

      let result;
      if ((selectionKind === "image" || selectionKind === "text_image") && imageBase64) {
        const messages = buildVisionMessages({ text: optionsPrompt, imageBase64, imageMimeType, systemText: DYNAMIC_OPTIONS_SYSTEM });
        result = await callGradient({ messages, model: VISION_MODEL_ID, temperature: 0.35 });
      } else {
        result = await callGradient({ prompt: optionsPrompt, systemText: DYNAMIC_OPTIONS_SYSTEM, model, temperature: 0.35 });
      }

      const parsed = parseJsonObject(result.text);
      const generated = parseActionListFromJson(parsed)
        .filter(a => !normalizedCurrent.includes(a))
        .slice(0, 10);

      if (cacheKey) writeCache(cache, cacheKey, generated);
      return generated;
    } catch {
      return [];
    }
  };
}

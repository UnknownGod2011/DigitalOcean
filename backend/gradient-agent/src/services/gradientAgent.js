/**
 * gradientAgent.js
 * Cursivis agentic layer — intent routing, content analysis,
 * browser action planning, and response generation.
 *
 * Powered by DigitalOcean Gradient AI serverless inference.
 */

import {
  callGradient,
  hasConfiguredCredentials,
  TEXT_MODEL_ID,
  VISION_MODEL_ID
} from "./gradientClient.js";
import {
  buildIntentRouterPrompt,
  inferUsefulCodeAction,
  inferFallbackType,
  normalizeActionHint,
  normalizeIntentDecision
} from "../contentClassifier.js";

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

// ── Build OpenAI-compatible vision message ────────────────────────────────────
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

// ── Intent inference ──────────────────────────────────────────────────────────
const intentCache = new Map();

export async function inferIntent({
  selectionKind = "text",
  text = "",
  imageBase64 = "",
  imageMimeType = "image/png",
  mode = "smart",
  actionHint = "",
  voiceCommand = ""
}) {
  if (!hasConfiguredCredentials()) {
    return fallbackIntentDecision({ selectionKind, text });
  }

  const startedAt = Date.now();
  const cacheKey = selectionKind === "text" && text.trim()
    ? `intent:${mode}:${actionHint}:${voiceCommand}:${text.trim().slice(0, 9000)}`
    : null;
  const cached = cacheKey ? readCache(intentCache, cacheKey) : null;
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

      const messages = buildVisionMessages({
        text: promptText,
        imageBase64,
        imageMimeType,
        systemText: INTENT_ROUTER_SYSTEM
      });
      result = await callGradient({ messages, model: VISION_MODEL_ID, temperature: 0.1 });
    } else {
      result = await callGradient({
        prompt: buildIntentRouterPrompt({ text, mode, actionHint, voiceCommand }),
        systemText: INTENT_ROUTER_SYSTEM,
        model: TEXT_MODEL_ID,
        temperature: 0.1
      });
    }

    const parsed = parseJsonObject(result.text);
    const normalized = selectionKind === "image"
      ? { ...(parsed || {}), contentType: "image" }
      : parsed;
    const decision = {
      ...normalizeIntentDecision(normalized, text),
      latencyMs: Date.now() - startedAt,
      model: result.model
    };

    if (cacheKey) writeCache(intentCache, cacheKey, decision);
    return decision;
  } catch {
    return { ...fallbackIntentDecision({ selectionKind, text }), latencyMs: Date.now() - startedAt };
  }
}

// ── Content analysis ──────────────────────────────────────────────────────────
export async function analyzeSelection({
  text,
  imageBase64,
  imageMimeType,
  action,
  contentType,
  voiceCommand,
  metadata
}) {
  const systemText = [
    EXECUTION_SYSTEM,
    `Detected content type: ${contentType || "general_text"}.`,
    `Chosen action: ${action || "summarize"}.`,
    "Return only the final user-facing result."
  ].join(" ");

  const hasImage = Boolean(imageBase64 && imageMimeType);
  const model = hasImage ? VISION_MODEL_ID : TEXT_MODEL_ID;

  if (hasImage) {
    const promptText = text
      ? `${text}\n\nAlso use the attached image as supporting context.`
      : `Perform this operation on the image: ${(action || "describe").replaceAll("_", " ")}. Return concise practical output only.`;
    const messages = buildVisionMessages({ text: promptText, imageBase64, imageMimeType, systemText });
    return callGradient({ messages, model, temperature: 0.7 });
  }

  return callGradient({ prompt: text, systemText, model, temperature: 0.7 });
}

// ── Browser action planning ───────────────────────────────────────────────────
export async function generateActionPlan(task, {
  originalText = "",
  resultText = "",
  action = "",
  voiceCommand = "",
  contentType = "general_text",
  browserContext = {}
}) {
  const prompt = [
    "You are a browser automation planner for Cursivis.",
    "Given the AI result and browser context, return a JSON action plan.",
    "Return strict JSON only:",
    JSON.stringify({
      steps: [{ action: "click|type|select|scroll|copy|paste|navigate", target: "CSS selector or description", value: "optional" }],
      summary: "one sentence plan summary",
      confidence: 0.0
    }, null, 2),
    `Task: ${task}`,
    `Action: ${action}`,
    `Content type: ${contentType}`,
    voiceCommand ? `Voice command: ${voiceCommand}` : "",
    `Browser context: ${JSON.stringify(browserContext).slice(0, 2000)}`,
    resultText ? `AI result to apply:\n${resultText.slice(0, 1000)}` : "",
    originalText ? `Original selection:\n${originalText.slice(0, 500)}` : ""
  ].filter(Boolean).join("\n\n");

  const result = await callGradient({ prompt, model: TEXT_MODEL_ID, temperature: 0.2 });
  const parsed = parseJsonObject(result.text);
  return parsed ?? { steps: [], summary: result.text, confidence: 0.5 };
}

// ── Response builder ──────────────────────────────────────────────────────────
export function generateResponse(resultType, {
  content,
  intent,
  action,
  alternatives = [],
  browserPlan = null,
  mode = "smart"
}) {
  return {
    protocolVersion: "1.0.0",
    resultType,
    action,
    intent,
    result: content,
    alternatives,
    browserPlan,
    mode,
    provider: "DigitalOcean Gradient AI"
  };
}

// ── Dynamic option generator ──────────────────────────────────────────────────
const optionsCache = new Map();

export async function generateDynamicOptions({
  selectionKind = "text",
  text = "",
  imageBase64 = "",
  imageMimeType = "image/png",
  contentType = "general_text",
  currentOptions = []
}) {
  if (!hasConfiguredCredentials()) return [];

  const normalizedCurrent = currentOptions.map(v => normalizeActionHint(String(v))).filter(Boolean);
  const cacheKey = selectionKind === "text" && text.trim()
    ? `options:${contentType}:${normalizedCurrent.join(",")}:${text.trim().slice(0, 6000)}`
    : null;
  const cached = cacheKey ? readCache(optionsCache, cacheKey) : null;
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
      result = await callGradient({ prompt: optionsPrompt, systemText: DYNAMIC_OPTIONS_SYSTEM, model: TEXT_MODEL_ID, temperature: 0.35 });
    }

    const parsed = parseJsonObject(result.text);
    const generated = parseActionListFromJson(parsed)
      .filter(a => !normalizedCurrent.includes(a))
      .slice(0, 10);

    if (cacheKey) writeCache(optionsCache, cacheKey, generated);
    return generated;
  } catch {
    return [];
  }
}

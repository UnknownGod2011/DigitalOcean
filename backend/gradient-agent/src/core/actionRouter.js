/**
 * actionRouter.js
 * Cursivis specialist action router.
 *
 * Classifies selected content and routes it to the most appropriate
 * specialist action handler. Returns routing metadata visible in the
 * response payload so the UI can show:
 *   "Detected type: broken code"
 *   "Selected action: debug_code"
 *   "Confidence: high"
 *
 * Powered by DigitalOcean Gradient AI serverless inference.
 */

import { callGradient, TEXT_MODEL_ID } from "../services/gradientClient.js";

// ── Specialist action definitions ─────────────────────────────────────────────
export const SPECIALIST_ACTIONS = {
  summarize:       { label: "Summarize",        contentTypes: ["report", "article", "general_text"] },
  rewrite:         { label: "Rewrite",           contentTypes: ["general_text", "email", "report"] },
  draft_reply:     { label: "Reply to Email",    contentTypes: ["email"] },
  polish_email:    { label: "Polish Email",      contentTypes: ["email"] },
  explain_code:    { label: "Explain Code",      contentTypes: ["code"] },
  debug_code:      { label: "Debug Code",        contentTypes: ["code"] },
  improve_code:    { label: "Improve Code",      contentTypes: ["code"] },
  translate:       { label: "Translate",         contentTypes: ["general_text", "report", "social_caption"] },
  answer_question: { label: "Answer Question",   contentTypes: ["question", "mcq"] },
  bullet_points:   { label: "Bullet Points",     contentTypes: ["report", "general_text", "article"] },
  extract_insights:{ label: "Extract Insights",  contentTypes: ["report", "article", "general_text"] },
  describe_image:  { label: "Describe Image",    contentTypes: ["image"] },
  extract_key_details: { label: "Extract Details", contentTypes: ["image", "report"] },
  identify_objects:{ label: "Identify Objects",  contentTypes: ["image"] }
};

// ── Confidence label ──────────────────────────────────────────────────────────
function confidenceLabel(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

// ── Route a request to the best specialist action ─────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.text          - Selected text
 * @param {string} [opts.contentType] - Pre-classified content type
 * @param {string} [opts.actionHint]  - User-requested action hint
 * @param {string} [opts.voiceCommand]- Voice command if any
 * @param {number} [opts.confidence]  - Confidence from intent router (0–1)
 * @returns {{ action: string, label: string, contentType: string, confidence: number, confidenceLabel: string, reasoning: string }}
 */
export function routeToSpecialist({ text = "", contentType = "general_text", actionHint = "", voiceCommand = "", confidence = 0.75 }) {
  // If user explicitly requested an action and it's a known specialist, trust it
  if (actionHint && SPECIALIST_ACTIONS[actionHint]) {
    return {
      action: actionHint,
      label: SPECIALIST_ACTIONS[actionHint].label,
      contentType,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      reasoning: `User explicitly requested "${actionHint}".`
    };
  }

  // Route by content type
  const typeRoutes = {
    code:           hasBrokenCode(text) ? "debug_code" : "explain_code",
    email:          looksLikeIncomingEmail(text) ? "draft_reply" : "polish_email",
    question:       "answer_question",
    mcq:            "answer_question",
    report:         "summarize",
    article:        "summarize",
    social_caption: "rewrite",
    image:          "describe_image",
    general_text:   "summarize"
  };

  const action = typeRoutes[contentType] ?? "summarize";
  const specialist = SPECIALIST_ACTIONS[action];

  return {
    action,
    label: specialist?.label ?? action,
    contentType,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    reasoning: `Content classified as "${contentType}" → routed to "${action}".`
  };
}

// ── Heuristics ────────────────────────────────────────────────────────────────
function hasBrokenCode(text) {
  return /\b(error|exception|undefined|null pointer|syntax error|cannot read|is not a function|traceback|stacktrace)\b/i.test(text);
}

function looksLikeIncomingEmail(text) {
  return /^(from:|subject:|dear |hi |hello |hey )/im.test(text);
}

// ── AI-powered routing (for ambiguous cases) ──────────────────────────────────
/**
 * Uses Gradient AI to classify and route ambiguous content.
 * Falls back to heuristic routing on error.
 */
export async function routeWithAI({ text, actionHint = "", voiceCommand = "" }) {
  const prompt = [
    "Classify this selected text and choose the single best AI action.",
    "Return strict JSON only — no markdown, no commentary:",
    JSON.stringify({
      contentType: "code|email|question|mcq|report|article|social_caption|general_text",
      action: "summarize|rewrite|draft_reply|polish_email|explain_code|debug_code|improve_code|translate|answer_question|bullet_points|extract_insights",
      confidence: 0.0,
      reasoning: "one sentence explaining the classification"
    }, null, 2),
    actionHint ? `User requested action: ${actionHint}` : "",
    voiceCommand ? `Voice command: ${voiceCommand}` : "",
    "Selected text:",
    text.slice(0, 4000)
  ].filter(Boolean).join("\n\n");

  try {
    const result = await callGradient({
      prompt,
      systemText: "You are the Cursivis action router. Return strict JSON only.",
      model: TEXT_MODEL_ID,
      temperature: 0.1,
      maxTokens: 256
    });

    const parsed = parseJson(result.text);
    if (!parsed?.action || !parsed?.contentType) throw new Error("Invalid router response");

    const action = parsed.action;
    const specialist = SPECIALIST_ACTIONS[action];

    return {
      action,
      label: specialist?.label ?? action,
      contentType: parsed.contentType,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
      confidenceLabel: confidenceLabel(typeof parsed.confidence === "number" ? parsed.confidence : 0.75),
      reasoning: parsed.reasoning ?? `Routed to "${action}" by Gradient AI classifier.`
    };
  } catch {
    // Fall back to heuristic routing
    return routeToSpecialist({ text, actionHint, voiceCommand });
  }
}

function parseJson(raw) {
  if (!raw?.trim()) return null;
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || raw.trim();
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(candidate.slice(s, e + 1)); } catch { return null; }
}

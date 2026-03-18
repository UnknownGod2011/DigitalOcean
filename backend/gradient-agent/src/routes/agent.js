/**
 * routes/agent.js
 * POST /agent — main agentic endpoint
 *
 * Returns a structured Cursivis response that includes:
 *   - detectedType: classified content type
 *   - selectedAction: the specialist action chosen
 *   - routingConfidence: "high" | "medium" | "low"
 *   - routingReasoning: one-sentence explanation
 *   - result: the AI-generated output
 *
 * Powered by DigitalOcean Gradient AI serverless inference.
 */

import { Router } from "express";
import { inferIntent, analyzeSelection, generateActionPlan, generateResponse } from "../services/gradientAgent.js";
import { routeWithAI, routeToSpecialist } from "../core/actionRouter.js";

const router = Router();

router.post("/", async (req, res) => {
  const {
    text,
    imageBase64,
    imageMimeType,
    audioBase64,
    action,
    mode = "smart",
    voiceCommand,
    browserContext,
    metadata
  } = req.body ?? {};

  if (!text && !imageBase64 && !audioBase64) {
    return res.status(400).json({ error: "At least one of text, imageBase64, or audioBase64 is required." });
  }

  try {
    // 1. Infer intent via Gradient AI
    const intentResult = await inferIntent({
      selectionKind: imageBase64 ? "image" : "text",
      text,
      imageBase64,
      imageMimeType,
      mode,
      actionHint: action,
      voiceCommand
    });

    // 2. Route to specialist action (adds routing metadata for UI display)
    let routing;
    if (text && !action) {
      // Use AI-powered routing for ambiguous text selections
      routing = await routeWithAI({ text, actionHint: action, voiceCommand });
    } else {
      routing = routeToSpecialist({
        text: text || "",
        contentType: intentResult.contentType,
        actionHint: action || intentResult.bestAction,
        voiceCommand,
        confidence: intentResult.confidence
      });
    }

    const resolvedAction = routing.action;

    // 3. Analyze selection with the resolved action
    const analysisResult = await analyzeSelection({
      text,
      imageBase64,
      imageMimeType,
      action: resolvedAction,
      contentType: routing.contentType,
      voiceCommand,
      metadata
    });

    // 4. Optionally generate browser action plan
    let browserPlan = null;
    if (browserContext && typeof browserContext === "object") {
      browserPlan = await generateActionPlan(resolvedAction, {
        originalText: text,
        resultText: analysisResult.text,
        action: resolvedAction,
        voiceCommand,
        contentType: routing.contentType,
        browserContext
      });
    }

    // 5. Build structured response with routing metadata
    const resultType = mapActionToResultType(resolvedAction);
    const response = generateResponse(resultType, {
      content: analysisResult.text,
      intent: intentResult.bestAction,
      action: resolvedAction,
      alternatives: intentResult.alternatives,
      browserPlan,
      mode
    });

    return res.json({
      ...response,
      // Routing metadata — visible in UI and demo
      detectedType: routing.contentType,
      selectedAction: resolvedAction,
      actionLabel: routing.label,
      routingConfidence: routing.confidenceLabel,
      routingReasoning: routing.reasoning,
      // Performance metadata
      latencyMs: analysisResult.latencyMs,
      model: analysisResult.model,
      usage: analysisResult.usage,
      timestampUtc: new Date().toISOString()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /429|rate limit|quota/i.test(msg) ? 429 : 500;
    return res.status(status).json({ error: "Agent request failed.", details: msg });
  }
});

function mapActionToResultType(action) {
  const map = {
    summarize:        "summary",
    rewrite:          "rewrite",
    answer_question:  "answer",
    debug_code:       "debug",
    explain:          "explain",
    explain_code:     "explain",
    improve_code:     "code",
    draft_reply:      "draft",
    polish_email:     "draft",
    translate:        "translation",
    bullet_points:    "bullets",
    extract_insights: "insights",
    describe_image:   "description",
    autofill:         "autofill",
    plan_browser_action: "browser_action_plan"
  };
  return map[action] ?? "summary";
}

export default router;

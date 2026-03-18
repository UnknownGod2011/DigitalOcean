/**
 * startupCheck.js
 * Validates DigitalOcean Gradient AI Platform connectivity at startup.
 * Sends a minimal test request and logs the result.
 */

import { getGradientClient, hasConfiguredCredentials, TEXT_MODEL_ID } from "./services/gradientClient.js";

export async function validateGradientConnection() {
  console.log("[startup] Validating DigitalOcean Gradient AI Platform connection...");

  if (!hasConfiguredCredentials()) {
    console.error("[startup] ✗ MODEL_ACCESS_KEY is not set.");
    console.error("[startup]   Copy .env.example to .env and set MODEL_ACCESS_KEY.");
    console.error("[startup]   Get your key at: https://cloud.digitalocean.com/agent-platform/serverless-inference");
    console.error("[startup]   Server will start but all Gradient AI calls will fail.");
    return;
  }

  const baseUrl = process.env.GRADIENT_BASE_URL || "https://inference.do-ai.run/v1/";
  console.log(`[startup] Endpoint: ${baseUrl}`);
  console.log(`[startup] Model   : ${TEXT_MODEL_ID}`);
  console.log(`[startup] Key     : ***${process.env.MODEL_ACCESS_KEY.slice(-4)}`);

  try {
    const client = getGradientClient();
    const response = await client.chat.completions.create({
      model: TEXT_MODEL_ID,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      max_tokens: 8,
      temperature: 0.0
    });
    const text = response.choices[0]?.message?.content?.trim() ?? "(empty)";
    console.log(`[startup] ✓ Gradient AI connection OK — model responded: "${text}"`);
    console.log(`[startup]   Resolved model: ${response.model}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] ✗ Gradient AI connection FAILED: ${msg}`);
    if (/401|unauthorized/i.test(msg)) {
      console.error("[startup]   → Invalid MODEL_ACCESS_KEY. Get a new one from the DigitalOcean Control Panel.");
      console.error("[startup]   → https://cloud.digitalocean.com/agent-platform/serverless-inference");
    } else if (/404|not found/i.test(msg)) {
      console.error(`[startup]   → Model "${TEXT_MODEL_ID}" not found on Gradient AI.`);
      console.error("[startup]   → Check GRADIENT_TEXT_MODEL in your .env file.");
      console.error("[startup]   → Available models: https://docs.digitalocean.com/products/gradient-ai/serverless-inference/");
    } else if (/429|rate limit/i.test(msg)) {
      console.error("[startup]   → Rate limit hit during startup check. Server will still work.");
    } else if (/ENOTFOUND|ECONNREFUSED|network/i.test(msg)) {
      console.error("[startup]   → Network error. Check your internet connection.");
    } else {
      console.error("[startup]   → Check MODEL_ACCESS_KEY and network connectivity.");
    }
    console.error("[startup]   Server will start but Gradient AI calls may fail.");
  }
}

/**
 * routes/voice.js
 * POST /voice — transcribe or process a voice input via Gradient AI
 * Real-time streaming is handled by the WebSocket gateway at /live
 */

import { Router } from "express";
import { transcribeOrProcessVoice } from "../services/gradientVoice.js";

const router = Router();

router.post("/", async (req, res) => {
  const { audioBase64, mimeType } = req.body ?? {};

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return res.status(400).json({ error: "audioBase64 is required." });
  }

  try {
    const result = await transcribeOrProcessVoice({
      audioBase64,
      mimeType: mimeType || "audio/wav"
    });

    return res.json({
      text: result.text,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      timestampUtc: new Date().toISOString()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /429|rate limit|quota/i.test(msg) ? 429 : 500;
    return res.status(status).json({ error: "Voice processing failed.", details: msg });
  }
});

export default router;

/**
 * gradientVoice.js
 * Voice transcription and WebSocket live gateway
 * powered by DigitalOcean Gradient AI serverless inference.
 *
 * /voice  — REST transcription endpoint
 * /live   — WebSocket streaming gateway (text-based, no proprietary audio stream)
 */

import { WebSocketServer } from "ws";
import { callGradient, hasConfiguredCredentials, TEXT_MODEL_ID } from "./gradientClient.js";

const LIVE_PATH = process.env.CURSIVIS_LIVE_VOICE_PATH || "/live";

const TRANSCRIPTION_SYSTEM =
  "You are a voice command transcription assistant for Cursivis. " +
  "The user will provide a spoken command about their current screen selection. " +
  "Transcribe and clean the command accurately. " +
  "Return only the transcribed command text — no commentary.";

// ── REST transcription ────────────────────────────────────────────────────────
export async function transcribeOrProcessVoice({ audioBase64, mimeType = "audio/wav" }) {
  if (!hasConfiguredCredentials()) {
    throw new Error("MODEL_ACCESS_KEY is required for voice processing.");
  }

  // Gradient AI text models don't accept raw audio bytes.
  // We treat the audioBase64 as a base64-encoded text command (from the companion app)
  // or fall back to a placeholder transcription prompt.
  let userText;
  try {
    userText = Buffer.from(audioBase64, "base64").toString("utf8").trim();
  } catch {
    userText = "";
  }

  const prompt = userText
    ? `Clean and return this voice command as plain text:\n\n${userText}`
    : "The user sent an audio command. Return: 'Voice command received — please type your command.'";

  return callGradient({
    prompt,
    systemText: TRANSCRIPTION_SYSTEM,
    model: TEXT_MODEL_ID,
    temperature: 0.1,
    maxTokens: 256
  });
}

// ── WebSocket live gateway ────────────────────────────────────────────────────
export function attachSonicGateway(server) {
  const wss = new WebSocketServer({ server, path: LIVE_PATH });

  wss.on("connection", (socket) => {
    if (!hasConfiguredCredentials()) {
      safeSend(socket, { type: "error", error: "MODEL_ACCESS_KEY is required for live voice." });
      socket.close();
      return;
    }

    safeSend(socket, { type: "live_open" });

    const chunks = [];

    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        switch (msg.type) {
          case "audio_chunk":
            if (msg.dataBase64) chunks.push(msg.dataBase64);
            break;

          case "audio_end": {
            // Combine all chunks and transcribe
            const combined = chunks.join("");
            chunks.length = 0;
            try {
              const result = await transcribeOrProcessVoice({ audioBase64: combined });
              safeSend(socket, { type: "model_text", text: result.text });
              safeSend(socket, { type: "turn_complete" });
            } catch (err) {
              safeSend(socket, { type: "error", error: err.message });
            }
            break;
          }

          case "text_command": {
            // Direct text command (typed or pre-transcribed)
            if (msg.text) {
              try {
                const result = await callGradient({
                  prompt: msg.text,
                  systemText: TRANSCRIPTION_SYSTEM,
                  model: TEXT_MODEL_ID,
                  temperature: 0.1,
                  maxTokens: 256
                });
                safeSend(socket, { type: "model_text", text: result.text });
                safeSend(socket, { type: "turn_complete" });
              } catch (err) {
                safeSend(socket, { type: "error", error: err.message });
              }
            }
            break;
          }

          case "close":
            socket.close();
            break;
        }
      } catch (err) {
        safeSend(socket, { type: "error", error: err.message });
      }
    });

    socket.on("close", () => { chunks.length = 0; });
  });
}

function safeSend(socket, payload) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}

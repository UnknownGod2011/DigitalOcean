/**
 * server.js
 * Cursivis Gradient Agent — HTTP + WebSocket server entry point.
 * Powered by DigitalOcean Gradient AI serverless inference.
 */

// Load .env before anything else
import "dotenv/config";

import http from "node:http";
import { createApp } from "./app.js";
import { attachSonicGateway } from "./services/gradientVoice.js";
import { validateGradientConnection } from "./startupCheck.js";

const port = Number(process.env.PORT || 8080);

// ── Startup validation ────────────────────────────────────────────────────────
await validateGradientConnection();

// ── Server ────────────────────────────────────────────────────────────────────
const app = createApp();
const server = http.createServer(app);
attachSonicGateway(server);

server.listen(port, () => {
  console.log(`[gradient-agent] Listening on http://127.0.0.1:${port}`);
  console.log(`[gradient-agent] Health: http://127.0.0.1:${port}/health`);
});

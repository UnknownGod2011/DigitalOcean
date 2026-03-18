# Cursivis — Cursor-Native AI Agent

> **Selection = Context · Trigger = Intent · Gradient AI = Intelligence**

Built for the **DigitalOcean Gradient™ AI Hackathon**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Cursivis turns your cursor into an AI agent. Select text, an image, or a UI region — press a trigger — and DigitalOcean Gradient AI classifies the content, routes it to the right specialist action, and returns the most useful result. Optionally, it executes that result directly in your browser.

---

## What Makes This Different

Most AI tools require you to open a chat window, explain context, paste content, wait, then manually apply the result. Cursivis eliminates all of that.

The interaction is:

1. **Select** — highlight text, lasso a screen region, or hold to talk
2. **Trigger** — press a button (Logitech MX Creative Console or keyboard shortcut)
3. **Review** — result appears in the orb UI and copies to clipboard
4. **Act** — optionally press "Take Action" to execute in the browser

The AI decision is visible in every response:
```json
{
  "detectedType": "code",
  "selectedAction": "debug_code",
  "actionLabel": "Debug Code",
  "routingConfidence": "high",
  "routingReasoning": "Content classified as \"code\" → routed to \"debug_code\"."
}
```

---

## DigitalOcean Gradient AI Features Used

| Feature | Implementation |
|---|---|
| Serverless Inference | All AI calls via `https://inference.do-ai.run/v1/` |
| Claude 4.5 Haiku | Text reasoning, intent routing, action planning |
| GPT-4o | Multimodal image + text understanding |
| GTE Large v1.5 | Semantic embeddings and context ranking |
| App Platform | Backend deployment via `.do/app.yaml` |

Single credential: `MODEL_ACCESS_KEY` from the DigitalOcean Control Panel. No IAM roles, no region config, no proprietary SDK.

---

## Architecture

```
Logitech MX Trigger / Keyboard Shortcut
        │
Windows Companion App (WPF / .NET 8)
  ├── text selection capture
  ├── lasso screenshot capture
  ├── orb + result UI
  ├── smart / guided modes
  └── voice capture (hold-to-talk)
        │
Gradient Agent Backend (Node.js)
  ├── POST /agent       ← specialist action router + Gradient AI
  ├── POST /analyze     ← legacy companion route
  ├── POST /suggest-actions
  ├── POST /voice       ← voice transcription
  ├── POST /plan        ← browser action plan generation
  ├── POST /embed       ← semantic context ranking
  └── WS   /live        ← real-time voice WebSocket
        │
DigitalOcean Gradient AI (Serverless Inference)
  ├── anthropic-claude-4.5-haiku   (text + routing)
  ├── openai-gpt-4o                (vision + multimodal)
  └── gte-large-v1.5               (embeddings)
        │
Browser Execution Layer
  ├── Chromium extension (current logged-in tab)
  └── Playwright agent (managed browser fallback)
```

---

## Running Instructions

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm 10+** — included with Node.js
- **DigitalOcean account** with Gradient AI Platform access
- **MODEL_ACCESS_KEY** — see below

### Step 1: Get Your MODEL_ACCESS_KEY

1. Go to [https://cloud.digitalocean.com/agent-platform/serverless-inference](https://cloud.digitalocean.com/agent-platform/serverless-inference)
2. Click the **Serverless Inference** tab
3. Scroll to **Model Access Keys**
4. Click **Create Access Key** (or copy an existing one)

### Step 2: Configure the Backend

```bash
cd backend/gradient-agent
cp .env.example .env
```

Open `.env` and set your key:

```
MODEL_ACCESS_KEY=your_key_here
```

### Step 3: Install Dependencies

```bash
cd backend/gradient-agent
npm install
```

### Step 4: Start the Backend

```bash
npm start
```

You should see:

```
[startup] Validating DigitalOcean Gradient AI Platform connection...
[startup] Endpoint: https://inference.do-ai.run/v1/
[startup] Model   : anthropic-claude-4.5-haiku
[startup] Key     : ***xxxx
[startup] ✓ Gradient AI connection OK — model responded: "ready"
[gradient-agent] Listening on http://127.0.0.1:8080
[gradient-agent] Health: http://127.0.0.1:8080/health
```

### Step 5: Test the Backend

**Health check:**
```bash
curl http://localhost:8080/health
```
Expected: `{"ok":true,"service":"gradient-agent","ts":"..."}`

**Agent endpoint (text analysis with routing metadata):**
```bash
curl -X POST http://localhost:8080/agent \
  -H "Content-Type: application/json" \
  -d '{
    "text": "def fibonacci(n):\n    return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)",
    "mode": "smart"
  }'
```

Expected response includes:
```json
{
  "detectedType": "code",
  "selectedAction": "explain_code",
  "actionLabel": "Explain Code",
  "routingConfidence": "high",
  "result": "...",
  "model": "anthropic-claude-4.5-haiku"
}
```

**Suggest actions (Guided Mode):**
```bash
curl -X POST http://localhost:8080/suggest-actions \
  -H "Content-Type: application/json" \
  -d '{
    "protocolVersion": "1.0.0",
    "requestId": "test-1",
    "mode": "guided",
    "selection": { "kind": "text", "text": "Please find attached the Q3 financial report for your review." },
    "context": { "activeApp": "outlook", "cursorX": 0, "cursorY": 0 },
    "timestampUtc": "2026-01-01T00:00:00Z"
  }'
```

**Semantic embeddings:**
```bash
curl -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning deployment",
    "items": ["Docker for ML models", "Chocolate cake recipe", "Kubernetes for inference", "Neural network training"]
  }'
```

### Step 6: Run the Smoke Test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -ModelAccessKey "your_key_here"
```

### Step 7: Launch the Full Demo Stack (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 -ModelAccessKey "your_key_here"
```

This starts: backend, browser action agent, extension bridge, and companion app.

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `MODEL_ACCESS_KEY` | — | **Yes** | DigitalOcean Gradient AI Model Access Key |
| `GRADIENT_TEXT_MODEL` | `anthropic-claude-4.5-haiku` | No | Text reasoning model |
| `GRADIENT_VISION_MODEL` | `openai-gpt-4o` | No | Vision / multimodal model |
| `GRADIENT_EMBEDDING_MODEL` | `gte-large-v1.5` | No | Embedding model |
| `GRADIENT_BASE_URL` | `https://inference.do-ai.run/v1/` | No | Gradient AI API base URL |
| `PORT` | `8080` | No | Backend HTTP port |

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health check |
| POST | `/agent` | Main agentic endpoint — routing metadata + Gradient AI result |
| POST | `/analyze` | Analyze text/image selection (companion app route) |
| POST | `/suggest-actions` | Get ranked action suggestions for Guided Mode |
| POST | `/voice` | Voice command transcription |
| POST | `/plan` | Generate browser action plan |
| POST | `/embed` | Embed and rank context items by semantic similarity |
| WS | `/live` | Real-time voice WebSocket gateway |

### `/agent` Response Schema

```json
{
  "protocolVersion": "1.0.0",
  "resultType": "summary|rewrite|answer|debug|explain|draft|translation|bullets|insights|description",
  "action": "summarize",
  "intent": "summarize",
  "result": "AI-generated output text",
  "alternatives": ["bullet_points", "explain", "translate"],
  "detectedType": "report",
  "selectedAction": "summarize",
  "actionLabel": "Summarize",
  "routingConfidence": "high",
  "routingReasoning": "Content classified as \"report\" → routed to \"summarize\".",
  "latencyMs": 820,
  "model": "anthropic-claude-4.5-haiku",
  "usage": { "inputTokens": 148, "outputTokens": 22 },
  "provider": "DigitalOcean Gradient AI",
  "timestampUtc": "2026-03-18T12:00:00.000Z"
}
```

---

## DigitalOcean App Platform Deployment

```bash
# Install doctl
# https://docs.digitalocean.com/reference/doctl/how-to/install/

# Authenticate
doctl auth init

# Deploy
doctl apps create --spec .do/app.yaml
```

After deployment, set `MODEL_ACCESS_KEY` as a secret in the App Platform dashboard:
**App Settings → Environment Variables → Add Secret → MODEL_ACCESS_KEY**

See [docs/DEPLOYMENT_DIGITALOCEAN.md](docs/DEPLOYMENT_DIGITALOCEAN.md) for full instructions.

---

## Project Structure

```
cursivis-gradient/
├── backend/gradient-agent/          # Node.js Gradient AI backend
│   ├── src/
│   │   ├── core/
│   │   │   └── actionRouter.js      # Specialist action router
│   │   ├── services/
│   │   │   ├── gradientClient.js    # OpenAI-compatible DO client
│   │   │   ├── gradientAgent.js     # inferIntent, analyzeSelection, generateActionPlan
│   │   │   ├── gradientVoice.js     # voice transcription + WebSocket gateway
│   │   │   └── gradientEmbeddings.js # embedText, rankOrEmbedContext
│   │   ├── routes/
│   │   │   ├── agent.js             # POST /agent (with routing metadata)
│   │   │   ├── voice.js             # POST /voice
│   │   │   ├── plan.js              # POST /plan
│   │   │   └── embed.js             # POST /embed
│   │   ├── app.js                   # Express app + legacy routes
│   │   ├── server.js                # HTTP server entry point
│   │   ├── gradientService.js       # Factory functions for app.js
│   │   ├── startupCheck.js          # Gradient AI connectivity check
│   │   ├── contentClassifier.js     # Content type classification
│   │   ├── browserActionPlanner.js  # Browser action plan builder
│   │   └── schemas.js               # JSON schema validators
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── desktop/
│   ├── cursivis-companion/          # WPF companion app (.NET 8)
│   ├── browser-action-agent/        # Playwright browser executor
│   ├── browser-extension-chromium/  # Chromium extension (MV3)
│   └── browser-native-host/         # Native messaging bridge
├── plugin/logitech-plugin/          # Logitech MX Creative Console (C#)
├── shared/ipc-protocol/             # JSON schema contracts
├── docs/
│   ├── DEPLOYMENT_DIGITALOCEAN.md
│   ├── HACKATHON_BUILD_POST.md
│   ├── DEMO_SCENARIOS.md
│   └── ARCHITECTURE_DIAGRAM.md
├── scripts/
│   ├── run-demo.ps1
│   ├── smoke-test.ps1
│   └── deploy-do.ps1
├── .do/app.yaml                     # DigitalOcean App Platform spec
├── ARCHITECTURE_PLAN.md
└── LICENSE
```

---

## Docs

- [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) — full system design
- [docs/HACKATHON_BUILD_POST.md](docs/HACKATHON_BUILD_POST.md) — how it was built
- [docs/DEPLOYMENT_DIGITALOCEAN.md](docs/DEPLOYMENT_DIGITALOCEAN.md) — deployment guide
- [docs/DEMO_SCENARIOS.md](docs/DEMO_SCENARIOS.md) — demo walkthrough with expected outputs
- [docs/ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md) — architecture diagram notes

---

## License

MIT — see [LICENSE](LICENSE)

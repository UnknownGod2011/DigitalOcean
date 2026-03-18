# Cursivis — Architecture Plan
## DigitalOcean Gradient AI Hackathon Submission

---

## A. Project Overview

Cursivis is a cursor-native AI agent that turns any text selection, screen region, or voice command into an intelligent action powered by **DigitalOcean Gradient AI** serverless inference.

The user selects content → presses a trigger (Logitech MX Creative Console or keyboard shortcut) → the companion app captures context and sends it to the Gradient Agent Backend → the intent router classifies the selection → a specialist action module generates the result → the result is displayed in the orb UI and optionally executed in the browser.

---

## B. Competition

**DigitalOcean Gradient AI Hackathon** — built entirely on DigitalOcean Gradient AI serverless inference.

---

## C. System Components

| Component | Technology | Role |
|---|---|---|
| Gradient Agent Backend | Node.js, OpenAI SDK (DO base URL) | Core AI reasoning, intent routing, action planning |
| Companion App | WPF / .NET 8 | Selection capture, orb UI, voice input, result display |
| Browser Action Agent | Playwright / Node.js | Executes browser actions in managed Chromium |
| Browser Extension | Chromium Extension (MV3) | Executes actions in the user's live logged-in tab |
| Native Messaging Host | .NET 8 | Bridge between companion app and browser extension |
| Logitech Plugin | C# / Logitech SDK | Trigger button integration via MX Creative Console |
| Shared IPC Protocol | JSON Schema | Contract between all components |

---

## 1. Gradient Agent Backend

The backend is a Node.js Express server that routes all AI work through DigitalOcean Gradient AI serverless inference using the OpenAI-compatible API.

### 1.1 Service Layer

| Service | File | Responsibility |
|---|---|---|
| Gradient Client | `services/gradientClient.js` | OpenAI client pointed at `https://inference.do-ai.run/v1/` |
| Gradient Agent | `services/gradientAgent.js` | `inferIntent`, `analyzeSelection`, `generateActionPlan` |
| Gradient Voice | `services/gradientVoice.js` | `transcribeOrProcessVoice`, `attachSonicGateway` |
| Gradient Embeddings | `services/gradientEmbeddings.js` | `embedText`, `embedImage`, `rankOrEmbedContext` |
| Gradient Service | `gradientService.js` | Factory functions for app.js: text generator, intent router, option generator |

### 1.2 API Routes

| Method | Path | Handler | Description |
|---|---|---|---|
| GET | `/health` | inline | Service health check |
| POST | `/agent` | `routes/agent.js` | Main agentic endpoint — full structured Gradient AI response |
| POST | `/analyze` | `app.js` | Analyze text/image selection (companion app route) |
| POST | `/suggest-actions` | `app.js` | Ranked action suggestions |
| POST | `/voice` | `routes/voice.js` | Buffered voice transcription via Gradient AI |
| POST | `/plan` | `routes/plan.js` | Browser action plan generation via Gradient AI |
| POST | `/embed` | `routes/embed.js` | Embed and rank context items |
| POST | `/transcribe` | `app.js` | Audio/text transcription |
| POST | `/plan-browser-action` | `app.js` | Browser action planning (legacy compat) |
| WS | `/live` | `services/gradientVoice.js` | Real-time voice WebSocket gateway |

### 1.3 DigitalOcean Gradient AI Models Used

| Model | Role |
|---|---|
| `meta-llama/Meta-Llama-3.1-70B-Instruct` | Text reasoning, intent routing, action planning, response generation |
| `meta-llama/Llama-3.2-11B-Vision-Instruct` | Multimodal image + text understanding |
| `text-embedding-3-small` | Context ranking and semantic similarity |

All models are served via DigitalOcean Gradient AI serverless inference — no GPU droplets required.

### 1.4 Startup Validation

On boot, `startupCheck.js` sends a minimal test request to Gradient AI and logs:
- `[startup] ✓ Gradient AI connection OK — model responded: "..."` on success
- Clear diagnostics on failure: missing `MODEL_ACCESS_KEY`, invalid key, model not found, rate limit

---

## 2. Companion App (WPF / .NET 8)

- Captures text selection via clipboard hook
- Captures screen region via lasso screenshot tool
- Sends payload to Gradient Agent Backend (`/agent` or `/analyze`)
- Displays result in floating orb UI
- Supports hold-to-talk voice input (sends audio to `/voice` or `/live`)
- Supports "Take Action" mode — sends to `/plan` then forwards plan to browser layer

---

## 3. Full Pipeline

### 3.1 Text / Image Selection Flow

```
User selects text or screen region
        ↓
Companion App captures selection + mode
        ↓
POST /agent  →  Gradient Agent Backend
        ↓
gradientAgent.inferIntent()  →  Gradient AI (Llama 3.1 70B)
        ↓
gradientAgent.analyzeSelection()  →  Gradient AI (Llama 3.1 70B or Vision)
        ↓
Structured JSON response returned
        ↓
Companion App displays result in orb UI
        ↓
(Optional) POST /plan  →  generateActionPlan()
        ↓
Browser Action Agent / Extension executes steps
```

### 3.2 Voice Flow

```
User holds trigger button
        ↓
Companion App captures audio / text command
        ↓
POST /voice  →  gradientVoice.transcribeOrProcessVoice()
        ↓
Gradient AI processes command + selection context
        ↓
Result returned to companion app
```

For real-time streaming: WebSocket `/live` → `gradientVoice.attachSonicGateway()`.

### 3.3 Browser Action Flow

```
POST /plan  →  gradientAgent.generateActionPlan()
        ↓
Gradient AI returns structured step list
        ↓
Browser Action Agent (Playwright) or Extension executes steps
        ↓
Result reported back to companion app
```

---

## 4. Data Flow Diagram

```
Logitech MX Trigger / Keyboard Shortcut
        |
Windows Companion App (WPF / .NET 8)
  ├── text selection capture
  ├── lasso screenshot capture
  ├── orb + result UI
  ├── smart / guided modes
  └── voice capture (hold-to-talk)
        |
Gradient Agent Backend (Node.js)
  ├── POST /agent       main agentic endpoint
  ├── POST /analyze     companion app route
  ├── POST /voice       buffered voice transcription
  ├── POST /plan        browser action plan generation
  ├── POST /embed       semantic context ranking
  └── WS   /live        real-time voice WebSocket gateway
        |
DigitalOcean Gradient AI (Serverless Inference)
  ├── meta-llama/Meta-Llama-3.1-70B-Instruct  (text + intent routing)
  ├── meta-llama/Llama-3.2-11B-Vision-Instruct (image + multimodal)
  └── text-embedding-3-small                   (semantic embeddings)
        |
Browser Execution Layer
  ├── Chromium extension (current logged-in tab)
  └── Local Playwright agent (managed browser fallback)
        |
Output
  ├── Result panel + clipboard copy
  ├── Optional insert / replace in active app
  └── Browser UI actions (fill, click, reply, autofill)
```

---

## 5. IPC Protocol

All inter-component communication uses JSON over HTTP or WebSocket. Schemas are defined in `shared/ipc-protocol/`.

Key message types:
- `SelectionPayload` — text, image bytes, mode, source app
- `GradientResponse` — intent, result, suggested_actions, browser_plan, latencyMs, model
- `BrowserPlan` — preferred_path, fallback_path, steps[]
- `VoicePayload` — audio bytes, selection context

---

## 6. Project Structure

```
cursivis-gradient/
 backend/gradient-agent/          # Node.js Gradient AI backend
    src/
       services/
          gradientClient.js       # OpenAI client → DO inference endpoint
          gradientAgent.js        # inferIntent, analyzeSelection, generateActionPlan
          gradientVoice.js        # voice transcription + WebSocket gateway
          gradientEmbeddings.js   # embedText, embedImage, rankOrEmbedContext
       routes/
          agent.js
          voice.js
          plan.js
          embed.js
       app.js
       server.js
       gradientService.js         # factory functions for app.js
       startupCheck.js
    .env.example
    Dockerfile
    package.json
 desktop/
    cursivis-companion/           # WPF companion app (.NET 8)
    browser-action-agent/         # Playwright browser executor
    browser-extension-chromium/   # Chromium extension (MV3)
    browser-native-host/          # Native messaging bridge
 plugin/logitech-plugin/          # Logitech MX Creative Console (C#)
 shared/ipc-protocol/             # JSON schema contracts
 docs/
    DEPLOYMENT_DIGITALOCEAN.md
    HACKATHON_BUILD_POST.md
    DEMO_SCENARIOS.md
    ARCHITECTURE_DIAGRAM.svg
 scripts/
    run-demo.ps1
    smoke-test.ps1
    deploy-do.ps1
```

---

## 7. Security

- `MODEL_ACCESS_KEY` is never hardcoded in source files
- All credentials are injected via environment variables at runtime
- `.env` is gitignored — only `.env.example` is committed
- No secrets appear in logs or API responses

---

## 8. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODEL_ACCESS_KEY` | — | DigitalOcean Gradient AI Model Access Key |
| `GRADIENT_TEXT_MODEL` | `meta-llama/Meta-Llama-3.1-70B-Instruct` | Text model ID |
| `GRADIENT_VISION_MODEL` | `meta-llama/Llama-3.2-11B-Vision-Instruct` | Vision model ID |
| `GRADIENT_EMBED_MODEL` | `text-embedding-3-small` | Embedding model ID |
| `PORT` | `8080` | Backend HTTP port |

---

## 9. Deployment

The Gradient Agent Backend is containerized via Docker and deployed to **DigitalOcean App Platform**.

```
Docker build → DO App Platform deploy (via .do/app.yaml)
```

See `docs/DEPLOYMENT_DIGITALOCEAN.md` and `scripts/deploy-do.ps1` for full instructions.

---

## 10. Why DigitalOcean Gradient AI

- Single credential (`MODEL_ACCESS_KEY`) — no IAM roles, no region config, no SDK setup
- OpenAI-compatible API — standard `openai` npm package, zero proprietary SDK
- Serverless inference — no GPU droplets to manage, pay-per-token
- Llama 3.1 70B — strong reasoning, fast, cost-effective for always-on trigger-driven UX
- Llama 3.2 Vision — multimodal image understanding in the same API
- Embeddings endpoint — semantic ranking for context-aware responses
- App Platform — simple container deployment with `.do/app.yaml`

---

## 11. Example Gradient AI Response

```json
{
  "protocolVersion": "1.0.0",
  "action": "summarize",
  "result": "DigitalOcean Gradient AI is a full-stack AI platform offering serverless inference, GPU compute, and seamless deployment for developers.",
  "confidence": 0.91,
  "alternatives": ["bullet_points", "explain", "translate"],
  "latencyMs": 820,
  "model": "meta-llama/Meta-Llama-3.1-70B-Instruct",
  "provider": "DigitalOcean Gradient AI",
  "usage": { "inputTokens": 148, "outputTokens": 22 }
}
```

---

## 12. References

- [DigitalOcean Gradient AI Docs](https://docs.digitalocean.com/products/gradient-ai/)
- [Serverless Inference](https://docs.digitalocean.com/products/gradient-ai/serverless-inference/)
- [App Platform](https://docs.digitalocean.com/products/app-platform/)
- [docs/DEPLOYMENT_DIGITALOCEAN.md](docs/DEPLOYMENT_DIGITALOCEAN.md)
- [docs/HACKATHON_BUILD_POST.md](docs/HACKATHON_BUILD_POST.md)

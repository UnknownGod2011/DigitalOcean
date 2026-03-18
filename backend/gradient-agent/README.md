# Cursivis Gradient Agent

DigitalOcean Gradient AI-powered backend for Cursivis.

Powered by:
- **anthropic-claude-4.5-haiku** — text reasoning, intent routing, action planning
- **openai-gpt-4o** — multimodal image + text understanding
- **gte-large-v1.5** — semantic embeddings and context ranking

All inference via `https://inference.do-ai.run/v1/` — single credential, no IAM, no region config.

## Prerequisites

- Node.js 20+
- DigitalOcean account with Gradient AI Platform access
- `MODEL_ACCESS_KEY` from the DO Control Panel

## Get Your MODEL_ACCESS_KEY

1. Go to [https://cloud.digitalocean.com/agent-platform/serverless-inference](https://cloud.digitalocean.com/agent-platform/serverless-inference)
2. Click the **Serverless Inference** tab
3. Scroll to **Model Access Keys**
4. Click **Create Access Key**

## Setup

```bash
cp .env.example .env
# Set MODEL_ACCESS_KEY=your_key_here in .env
npm install
npm start
```

Expected startup output:

```
[startup] Validating DigitalOcean Gradient AI Platform connection...
[startup] Endpoint: https://inference.do-ai.run/v1/
[startup] Model   : anthropic-claude-4.5-haiku
[startup] Key     : ***xxxx
[startup] ✓ Gradient AI connection OK — model responded: "ready"
[gradient-agent] Listening on http://127.0.0.1:8080
```

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `MODEL_ACCESS_KEY` | — | **Yes** | DigitalOcean Gradient AI Model Access Key |
| `GRADIENT_TEXT_MODEL` | `anthropic-claude-4.5-haiku` | No | Text reasoning model |
| `GRADIENT_VISION_MODEL` | `openai-gpt-4o` | No | Vision / multimodal model |
| `GRADIENT_EMBEDDING_MODEL` | `gte-large-v1.5` | No | Embedding model |
| `GRADIENT_BASE_URL` | `https://inference.do-ai.run/v1/` | No | Gradient AI API base URL |
| `PORT` | `8080` | No | HTTP port |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check — shows configured models |
| POST | `/agent` | Main agentic endpoint — routing metadata + Gradient AI result |
| POST | `/analyze` | Analyze text/image selection (companion app route) |
| POST | `/suggest-actions` | Get ranked action suggestions for Guided Mode |
| POST | `/voice` | Voice command transcription |
| POST | `/plan` | Generate browser action plan |
| POST | `/embed` | Embed and rank context items by semantic similarity |
| WS | `/live` | Real-time voice WebSocket gateway |

## Docker

```bash
# From the cursivis-gradient/ root
docker build -f backend/gradient-agent/Dockerfile -t cursivis-gradient-agent .
docker run -p 8080:8080 --env-file backend/gradient-agent/.env cursivis-gradient-agent
```

# Cursivis Architecture Diagram

Primary diagram asset:

- [ARCHITECTURE_DIAGRAM_CHATGPT.png](ARCHITECTURE_DIAGRAM_CHATGPT.png)

Alternate vector version:

- [ARCHITECTURE_DIAGRAM.svg](ARCHITECTURE_DIAGRAM.svg)

## Architecture Summary

Cursivis is a cursor-native AI agent built on **DigitalOcean Gradient AI** serverless inference.

The diagram shows:

- the user input surfaces: text selection, image/lasso capture, voice command, and Logitech trigger
- the Windows companion app (WPF / .NET 8) and orb UI
- the Gradient Agent Backend (Node.js) deployed on DigitalOcean App Platform
- DigitalOcean Gradient AI serverless inference (Llama 3.1 70B, Llama 3.2 Vision, embeddings)
- the real-browser current-tab execution path through the Chromium extension bridge
- the managed-browser fallback path via Playwright
- the final output surfaces: result panel, clipboard, insert/replace, and Take Action

## Key Architecture Decisions

- All AI calls go through `https://inference.do-ai.run/v1/` using the standard `openai` npm package
- Single credential: `MODEL_ACCESS_KEY` from the DigitalOcean Control Panel
- No GPU droplets, no hosted agents, no knowledge base infrastructure required to run
- Backend is stateless and containerized — deploys to DO App Platform via `.do/app.yaml`

## DigitalOcean Gradient AI Features Used

| Feature | How Cursivis Uses It |
|---|---|
| Serverless Inference | All text, vision, and embedding calls |
| Llama 3.1 70B Instruct | Intent routing, text generation, action planning |
| Llama 3.2 Vision Instruct | Image analysis, multimodal selection understanding |
| Embeddings | Semantic context ranking via `/embed` endpoint |
| App Platform | Backend container deployment |

## Recommended Submission Placements

- Image carousel (use `ARCHITECTURE_DIAGRAM_CHATGPT.png`)
- File upload
- Code repository README

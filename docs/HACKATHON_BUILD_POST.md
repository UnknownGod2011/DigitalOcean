# How I Built Cursivis: A Cursor-Native AI Agent on DigitalOcean Gradient AI

Built for the **DigitalOcean Gradient™ AI Hackathon**.

---

## Introduction

Most AI products still start with the same workflow: open a chatbot, describe the context, paste content, wait for an answer, then manually apply that answer somewhere else.

I wanted to build something different.

That idea became **Cursivis**:

> **Selection = Context · Trigger = Intent · Gradient AI = Intelligence**

Instead of moving work into a prompt box, Cursivis brings AI directly to what the user is already looking at. The user selects text, an image, or a UI region, presses a trigger, and DigitalOcean Gradient AI classifies the content, routes it to the right specialist action, and returns the most useful result. Then Cursivis can optionally execute that result directly in the browser.

---

## What Cursivis Does

Cursivis is a **cursor-native multimodal AI agent** designed for desktop workflows.

It can:

- summarize long reports and articles
- explain or debug selected code
- rewrite rough text or emails
- draft responses to emails
- analyze selected images and screen regions
- accept voice commands and apply them to the selection
- autofill forms
- reply in live browser tabs

The goal is to move beyond text-in/text-out AI and toward an interaction model where the AI becomes part of the interface itself.

---

## Core Product Idea

The main interaction loop is very simple:

1. The user selects something on screen
2. The user presses a trigger
3. Gradient AI classifies the content and routes it to a specialist action
4. Cursivis returns the most useful result
5. The user can optionally press **Take Action** to execute it in the UI

That means a selection is not just text. It is context.

The same trigger behaves differently depending on what is selected:

- a report → summarized
- foreign-language text → translated
- broken code → debugged
- correct code → explained
- an email → polished or replied to

---

## How I Built It

Cursivis is built as a multi-part system:

- a **Windows companion app** in WPF and .NET 8
- a **Gradient Agent Backend** in Node.js using the **OpenAI-compatible DigitalOcean Gradient AI API**
- a **specialist action router** that classifies content and routes to the right handler
- a **Chromium browser extension** for real current-tab actions
- a **local browser bridge** for DOM-aware execution
- a **DigitalOcean App Platform deployment** for the backend
- integration with the **Logitech MX Creative Console** interaction model

### DigitalOcean Gradient AI Features Used

| Feature | How Cursivis Uses It |
|---|---|
| Serverless Inference | All text, vision, and embedding calls via `https://inference.do-ai.run/v1/` |
| Claude 4.5 Haiku | Text reasoning, intent routing, action planning, response generation |
| GPT-4o | Multimodal image + text understanding |
| GTE Large v1.5 | Semantic context ranking via `/embed` endpoint |
| App Platform | Backend container deployment via `.do/app.yaml` |

The backend uses the standard `openai` npm package pointed at the DigitalOcean inference endpoint. A single `MODEL_ACCESS_KEY` is the only credential needed — no IAM roles, no region config, no proprietary SDK.

### Specialist Action Router

One of the key architectural additions is the `core/actionRouter.js` module. When a user triggers Cursivis, the system:

1. Classifies the selected content (code, email, question, report, image, etc.)
2. Routes it to the most appropriate specialist action (debug_code, draft_reply, answer_question, etc.)
3. Returns routing metadata in the response payload:
   - `detectedType`: what the content was classified as
   - `selectedAction`: which specialist action was chosen
   - `routingConfidence`: high / medium / low
   - `routingReasoning`: one-sentence explanation

This makes the AI decision-making visible and demoable.

---

## Why DigitalOcean Gradient AI Was the Right Choice

DigitalOcean Gradient AI was central to the project for several reasons:

- **Single credential**: `MODEL_ACCESS_KEY` is all that is needed — no complex IAM setup
- **OpenAI-compatible API**: the standard `openai` npm package works out of the box
- **Multi-provider models**: Claude, GPT-4o, Llama, and embeddings through one endpoint
- **Serverless inference**: no GPU droplets to manage, pay-per-token
- **App Platform**: simple container deployment with a single YAML spec

The always-on, trigger-driven interaction model of Cursivis requires fast, cost-effective inference. Gradient AI's serverless model fits this perfectly.

---

## DigitalOcean App Platform Deployment

The backend is containerized and deployed to DigitalOcean App Platform:

```
Docker build → App Platform deploy (via .do/app.yaml)
```

The deployment spec is committed to the repository at `.do/app.yaml`. Judges can deploy their own instance with:

```bash
doctl apps create --spec .do/app.yaml
```

---

## Challenges I Faced

The hardest part was not generating text. The hard part was building a system that feels like a real UI agent.

Some of the biggest challenges were:

- keeping Smart Mode useful without over-hardcoding behavior
- handling text, image, and voice in one coherent flow
- making browser actions work inside real logged-in tabs
- keeping the UI smooth and understandable
- building a routing layer that is both fast and explainable

---

## What I Learned

- multimodal AI becomes much more compelling when tied to a real interface
- good agent UX depends heavily on trust and clarity
- hardware triggers create a much more natural feeling than opening a chatbot
- the most useful AI interaction is often not "ask a prompt" but simply "select and trigger"
- DigitalOcean Gradient AI's OpenAI-compatible API makes migration and iteration very fast

---

## Why Cursivis Matters

Cursivis is an attempt to explore a future where AI is no longer a separate destination.

Instead of:

- opening a chat app
- explaining context
- copying data in and out
- manually taking action

the user can simply:

- select
- trigger
- review
- act

That is the experience this project prototypes: a multimodal AI layer that lives directly on top of everyday work, powered by DigitalOcean Gradient AI.

---

## Closing

Cursivis started from one simple idea:

**What if the cursor itself became an AI agent?**

By combining DigitalOcean Gradient AI serverless inference, a specialist action router, multimodal input, browser execution, and a hardware-triggered UX, Cursivis moves beyond the text box and turns ordinary on-screen context into something actionable.

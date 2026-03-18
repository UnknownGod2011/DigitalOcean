# Cursivis Demo Scenarios

These scenarios demonstrate the key capabilities of Cursivis powered by DigitalOcean Gradient AI.

Each scenario shows the routing metadata that appears in the response:
- `detectedType` — what the content was classified as
- `selectedAction` — which specialist action was chosen
- `routingConfidence` — high / medium / low
- `routingReasoning` — one-sentence explanation

---

## Scenario 1: Smart Text Summary

**What to do:**
1. Select a paragraph of text in any app or browser.
2. Press the trigger (MX Creative Console or keyboard shortcut).
3. Cursivis orb appears and shows processing.
4. Result auto-copies to clipboard.

**Expected response metadata:**
```json
{
  "detectedType": "report",
  "selectedAction": "summarize",
  "actionLabel": "Summarize",
  "routingConfidence": "high",
  "routingReasoning": "Content classified as \"report\" → routed to \"summarize\".",
  "model": "anthropic-claude-4.5-haiku"
}
```

---

## Scenario 2: Code Debug

**What to do:**
1. Select a code snippet that contains an error or exception message.
2. Press the trigger.
3. Cursivis detects broken code and routes to `debug_code`.

**Expected response metadata:**
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

## Scenario 3: Email Reply Draft

**What to do:**
1. Select an incoming email in your browser or email client.
2. Press the trigger.
3. Cursivis detects it is an incoming email and routes to `draft_reply`.

**Expected response metadata:**
```json
{
  "detectedType": "email",
  "selectedAction": "draft_reply",
  "actionLabel": "Reply to Email",
  "routingConfidence": "high",
  "routingReasoning": "Content classified as \"email\" → routed to \"draft_reply\"."
}
```

---

## Scenario 4: Image / Lasso Analysis

**What to do:**
1. Press the trigger with no text selected.
2. Lasso capture opens — draw a region around any UI element or image.
3. Image is sent to Gradient AI (GPT-4o vision model).
4. Cursivis returns a description or analysis.

**Expected response metadata:**
```json
{
  "detectedType": "image",
  "selectedAction": "describe_image",
  "actionLabel": "Describe Image",
  "routingConfidence": "high",
  "model": "openai-gpt-4o"
}
```

---

## Scenario 5: Guided Mode — Multiple Actions

**What to do:**
1. Select text.
2. Trigger in Guided mode.
3. Menu shows ranked action suggestions from Gradient AI.
4. Pick any action (Translate, Bullet Points, Extract Insights, etc.).
5. Result appears and copies.

This demonstrates the `/suggest-actions` endpoint and dynamic option generation.

---

## Scenario 6: Voice Command

**What to do:**
1. Select text.
2. Long-press the trigger.
3. Speak a command: "translate this to Spanish" or "make this more formal".
4. Backend receives selection + voice command.
5. Gradient AI applies the voice command to the selection.

---

## Scenario 7: Semantic Context Ranking (Embeddings)

**What to do:**
1. Call `POST /embed` with a query and a list of items.
2. Gradient AI embeds all items using GTE Large v1.5.
3. Items are ranked by cosine similarity to the query.

**Example request:**
```json
{
  "query": "machine learning deployment",
  "items": [
    "Docker containerization for ML models",
    "Recipe for chocolate cake",
    "Kubernetes scaling for inference workloads",
    "How to train a neural network"
  ]
}
```

**Expected:** Items ranked by relevance to "machine learning deployment".

---

## Scenario 8: Browser Action Execution

**What to do:**
1. Select an email draft in the browser.
2. Trigger with "Take Action" mode.
3. Cursivis calls `/plan` — Gradient AI generates a browser action plan.
4. Browser extension executes the steps in the live tab.

**Example plan response:**
```json
{
  "goal": "apply_email_result",
  "summary": "Open compose and fill the generated email body.",
  "steps": [
    { "tool": "click_role", "role": "button", "name": "Compose" },
    { "tool": "fill_label", "label": "Message Body", "text": "..." }
  ]
}
```

---

## API Quick Test

Test the backend directly without the companion app:

```bash
# Health check
curl http://localhost:8080/health

# Analyze text
curl -X POST http://localhost:8080/agent \
  -H "Content-Type: application/json" \
  -d '{
    "text": "DigitalOcean Gradient AI provides serverless inference for production AI applications.",
    "mode": "smart"
  }'

# Suggest actions
curl -X POST http://localhost:8080/suggest-actions \
  -H "Content-Type: application/json" \
  -d '{
    "protocolVersion": "1.0.0",
    "requestId": "test-1",
    "mode": "guided",
    "selection": { "kind": "text", "text": "def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)" },
    "context": { "activeApp": "vscode", "cursorX": 0, "cursorY": 0 },
    "timestampUtc": "2026-01-01T00:00:00Z"
  }'
```

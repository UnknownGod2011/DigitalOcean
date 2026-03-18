/**
 * gradientEmbeddings.js
 * Text embedding and semantic ranking
 * powered by DigitalOcean Gradient AI serverless inference.
 */

import { getGradientClient, hasConfiguredCredentials, EMBED_MODEL_ID } from "./gradientClient.js";

// ── Single text embed ─────────────────────────────────────────────────────────
export async function embedText(text) {
  if (!hasConfiguredCredentials()) {
    throw new Error("MODEL_ACCESS_KEY is required for embeddings.");
  }
  const client = getGradientClient();
  const startedAt = Date.now();
  const response = await client.embeddings.create({
    model: EMBED_MODEL_ID,
    input: text
  });
  return {
    embedding: response.data[0].embedding,
    model: response.model || EMBED_MODEL_ID,
    latencyMs: Date.now() - startedAt
  };
}

// ── Image embed (via text description fallback) ───────────────────────────────
export async function embedImage(imageBase64) {
  // Gradient AI serverless inference doesn't expose a dedicated image embedding endpoint.
  // We embed a placeholder description — swap this for a vision model call if needed.
  return embedText(`[image content: ${imageBase64.slice(0, 32)}...]`);
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Rank context items by semantic similarity to query ────────────────────────
export async function rankOrEmbedContext({ query, items }) {
  if (!hasConfiguredCredentials()) {
    throw new Error("MODEL_ACCESS_KEY is required for context ranking.");
  }

  const startedAt = Date.now();
  const [queryResult, ...itemResults] = await Promise.all([
    embedText(query),
    ...items.map(item => embedText(typeof item === "string" ? item : item.text || JSON.stringify(item)))
  ]);

  const ranked = items.map((item, i) => ({
    item,
    score: cosineSimilarity(queryResult.embedding, itemResults[i].embedding)
  })).sort((a, b) => b.score - a.score);

  return {
    ranked,
    model: queryResult.model,
    latencyMs: Date.now() - startedAt
  };
}

import "server-only";

/**
 * The stream's AI co-host agent. Generates a short, real line of live commentary
 * with a free LLM (Groq by default — no cost on testnet). The treasury pays this
 * agent per call on-chain, so it genuinely earns for genuine work. Falls back to
 * a canned line if no key is configured, so the app never breaks.
 *
 * Set GROQ_API_KEY (free at console.groq.com, no card) to turn on real AI.
 */
const API_KEY = process.env.GROQ_API_KEY;
const BASE_URL = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
const MODEL = process.env.AI_MODEL ?? "openai/gpt-oss-20b";

const FALLBACK = [
  "Welcome in — glad you're here.",
  "Loving the energy in here today.",
  "Drop a hello in the chat!",
  "Every second you watch supports the creator.",
  "Stick around, it's just getting good.",
  "Shout out to everyone tuning in.",
];

function fallback(): string {
  return FALLBACK[Math.floor(Date.now() / 7000) % FALLBACK.length];
}

/**
 * Long dashes read as machine-written, and asking the model not to use them
 * only mostly works — it still returns an em dash often enough that viewers
 * see it. Swap them for the comma the sentence wanted, deterministically.
 */
export function plainText(s: string): string {
  return s
    .replace(/^\s*[—–]\s*/, "")
    .replace(/\s*[—–]\s*$/, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

/** Real (or fallback) one-line live commentary from the AI co-host agent. */
export async function generateCommentary(): Promise<string> {
  if (!API_KEY) return fallback();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 1,
        // Reasoning tokens count toward the limit, so a one-liner still needs
        // headroom; keep the thinking short since this is 12 words of chat.
        reasoning_effort: "low",
        max_tokens: 256,
        messages: [
          {
            role: "system",
            content:
              "You are an upbeat AI co-host on a live stream. Reply with ONE short, friendly, varied line to the audience (max 12 words). No emojis, no quotes, no hashtags, no dashes.",
          },
          { role: "user", content: "Say something to the live audience right now." },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Silent fallback reads as a working AI, so leave a trace in the logs —
      // a retired model or a dead key looks identical from the outside.
      console.warn(`co-host LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return fallback();
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("co-host LLM returned no content");
      return fallback();
    }
    return plainText(text.replace(/^["']|["']$/g, "")).slice(0, 120);
  } catch {
    return fallback();
  }
}

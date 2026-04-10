import {
  TRANSFORM_SYSTEM_PROMPT,
  DISALLOWED_INTENT_MESSAGE,
  containsDisallowedIntent
} from "./_lib/safety.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function heuristicToClassical(input) {
  let s = input.trim();
  const replacements = [
    ["请", "烦请"],
    ["可以", "可"],
    ["然后", "继而"],
    ["如果", "若"],
    ["这个", "此"],
    ["那个", "彼"],
    ["怎么", "何以"],
    ["为什么", "何故"],
    ["需要", "需"],
    ["不要", "毋"],
    ["完成", "毕"],
    ["告诉我", "以告我"]
  ];

  for (const [from, to] of replacements) {
    s = s.replaceAll(from, to);
  }

  if (!/[。！？]$/.test(s)) {
    s += "。";
  }

  return `请以文言叙之：${s}`;
}

function heuristicToModern(input) {
  let s = input.trim();
  const replacements = [
    ["毋", "不要"],
    ["何以", "怎么"],
    ["何故", "为什么"],
    ["此", "这个"],
    ["彼", "那个"],
    ["继而", "然后"],
    ["烦请", "请"],
    ["以告我", "告诉我"]
  ];

  for (const [from, to] of replacements) {
    s = s.replaceAll(from, to);
  }

  return s;
}

async function convertByLLM(text, mode) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      result: mode === "to_classical" ? heuristicToClassical(text) : heuristicToModern(text),
      engine: "heuristic"
    };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const userPrompt =
    mode === "to_classical"
      ? `将以下现代中文指令改写为自然、简洁、可读的文言文，保持语义一致，不扩展额外步骤：\n${text}`
      : `将以下文言文改写为现代中文口语指令，保持语义一致，不扩展额外步骤：\n${text}`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: TRANSFORM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`upstream_error_${resp.status}: ${errText.slice(0, 280)}`);
  }

  const data = await resp.json();
  const output = data?.choices?.[0]?.message?.content?.trim();

  if (!output) {
    throw new Error("empty_model_output");
  }

  return { result: output, engine: model };
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  const body = parseBody(req.body);
  const text = (body.text || "").toString().trim();
  const mode = body.mode === "to_modern" ? "to_modern" : "to_classical";

  if (!text) {
    return res.status(400).json({
      ok: false,
      error: "empty_text"
    });
  }

  if (text.length > 1200) {
    return res.status(400).json({
      ok: false,
      error: "text_too_long",
      message: "单次最多支持 1200 字。"
    });
  }

  if (containsDisallowedIntent(text)) {
    return res.status(400).json({
      ok: false,
      error: "disallowed_intent",
      message: DISALLOWED_INTENT_MESSAGE
    });
  }

  try {
    const { result, engine } = await convertByLLM(text, mode);
    return res.status(200).json({
      ok: true,
      mode,
      engine,
      result
    });
  } catch (err) {
    const fallback = mode === "to_classical" ? heuristicToClassical(text) : heuristicToModern(text);
    return res.status(200).json({
      ok: true,
      mode,
      engine: "heuristic_fallback",
      result: fallback,
      warning: err.message || "fallback_used"
    });
  }
}

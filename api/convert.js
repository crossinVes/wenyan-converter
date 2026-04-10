import { SYSTEM_PROMPT, buildUserPrompt } from "./_lib/persona.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const CLASSICAL_REPLACEMENTS = [
  ["这段文字", "此段之辞"],
  ["这段内容", "此段之文"],
  ["改进建议", "匡正之策"],
  ["请你", "愿汝"],
  ["请先", "先须"],
  ["告诉我", "见告于吾"],
  ["给我", "予吾"],
  ["帮我", "为吾"],
  ["这段", "此段"],
  ["这个", "此"],
  ["那个", "彼"],
  ["总结", "撮其旨"],
  ["概括", "约其要"],
  ["分析", "析其理"],
  ["解释", "释其义"],
  ["建议", "策"],
  ["内容", "其文"],
  ["文字", "其辞"],
  ["然后", "继而"],
  ["并且", "且"],
  ["同时", "并"],
  ["如果", "若"],
  ["因为", "缘"],
  ["所以", "故"],
  ["怎么", "何以"],
  ["为什么", "奚故"],
  ["需要", "须"],
  ["不要", "毋"],
  ["不能", "弗能"],
  ["必须", "务须"],
  ["应该", "当"],
  ["可以", "可"],
  ["完成", "毕"],
  ["处理", "治"],
  ["生成", "成"],
  ["输出", "出之"],
  ["三条", "三端"],
  ["两条", "二端"],
  ["一条", "一端"],
  ["我们", "吾侪"],
  ["你", "汝"],
  ["我", "吾"],
  ["请", "愿"]
];

const MODERN_REPLACEMENTS = [
  ["此段之辞", "这段文字"],
  ["此段之文", "这段内容"],
  ["匡正之策", "改进建议"],
  ["见告于吾", "告诉我"],
  ["予吾", "给我"],
  ["为吾", "帮我"],
  ["此段", "这段"],
  ["撮其旨", "总结"],
  ["约其要", "概括"],
  ["析其理", "分析"],
  ["释其义", "解释"],
  ["其文", "内容"],
  ["其辞", "文字"],
  ["继而", "然后"],
  ["奚故", "为什么"],
  ["何以", "怎么"],
  ["务须", "必须"],
  ["弗能", "不能"],
  ["毋", "不要"],
  ["须", "需要"],
  ["毕", "完成"],
  ["治", "处理"],
  ["出之", "输出"],
  ["成", "生成"],
  ["吾侪", "我们"],
  ["汝", "你"],
  ["吾", "我"],
  ["此", "这个"],
  ["彼", "那个"],
  ["若", "如果"],
  ["缘", "因为"],
  ["故", "所以"],
  ["且", "并且"],
  ["并", "同时"],
  ["愿", "请"],
  ["当", "应该"],
  ["可", "可以"]
];

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

function applyPhraseReplacements(text, replacements) {
  let out = text;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

function heuristicToClassical(input) {
  let s = input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!！]/g, "！")
    .replace(/[?？]/g, "？");

  s = applyPhraseReplacements(s, CLASSICAL_REPLACEMENTS)
    .replace(/撮其旨此段之辞/g, "撮此段之辞之旨")
    .replace(/约其要此段之辞/g, "约此段之辞之要")
    .replace(/(一下|一下子|吧|呢|啊|呀)/g, "")
    .replace(/，+/g, "，")
    .replace(/。+/g, "。")
    .trim();

  if (!s.startsWith("夫") && !s.startsWith("今")) {
    s = `夫${s}`;
  }

  if (!/[。！？]$/.test(s)) {
    s += "。";
  }

  return s;
}

function heuristicToModern(input) {
  let s = input.trim().replace(/\s+/g, " ");

  s = applyPhraseReplacements(s, MODERN_REPLACEMENTS)
    .replace(/^夫/, "")
    .replace(/^先需要/, "请先")
    .replace(/[矣焉耳也]+(?=[。！？]|$)/g, "")
    .replace(/，+/g, "，")
    .replace(/。+/g, "。")
    .trim();

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
  const userPrompt = buildUserPrompt(text, mode);

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

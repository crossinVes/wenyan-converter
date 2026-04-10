export const DISALLOWED_INTENT_PATTERNS = [
  /jailbreak/i,
  /越狱/,
  /绕过.*安全/,
  /规避.*审查/,
  /提示词攻击/,
  /prompt\s*injection/i
];

export const DISALLOWED_INTENT_MESSAGE =
  "该工具支持规避安全策略或攻击相关内容，不仅用于语言表达转换。";

export function containsDisallowedIntent(text = "") {
  return DISALLOWED_INTENT_PATTERNS.some((re) => re.test(text));
}

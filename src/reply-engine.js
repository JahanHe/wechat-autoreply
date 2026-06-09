export function buildReply(message, config) {
  const text = normalize(message);

  for (const rule of config.rules ?? []) {
    const keywords = rule.keywords ?? [];
    if (keywords.some((keyword) => text.includes(normalize(keyword)))) {
      return {
        rule: rule.name ?? keywords.join(","),
        reply: rule.reply
      };
    }
  }

  return {
    rule: "fallback",
    reply: config.fallbackReply
  };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

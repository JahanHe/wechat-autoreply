const STOP_WORDS = new Set([
  "您好", "你好", "请问", "一下", "可以", "这个", "那个", "什么", "怎么", "为什么",
  "有没有", "是不是", "能不能"
]);

export function tokenizeText(value, options = {}) {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return [];
  const latin = text.match(/[a-z0-9]{2,}/g) || [];
  const chinese = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const tokens = [...latin];
  for (const block of chinese) {
    tokens.push(block);
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= block.length - size; index += 1) {
        tokens.push(block.slice(index, index + size));
      }
    }
  }
  const unique = [...new Set(tokens)];
  return options.keepStopWords ? unique : unique.filter((token) => !STOP_WORDS.has(token));
}

export function scoreText(query, value) {
  const tokens = Array.isArray(query) ? query : tokenizeText(query);
  const text = String(value || "").toLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? token.length : 0), 0);
}

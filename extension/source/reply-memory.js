export function replySignature(reply) {
  return String(reply || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 220);
}

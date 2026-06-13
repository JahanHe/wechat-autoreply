export function aiProcessSteps(trace = {}, usedJudgmentLibrary = false) {
  const steps = ["检测消息", "收集上下文"];
  if (trace?.judgmentQueried) {
    steps.push(usedJudgmentLibrary ? `判断库命中${Number(trace.judgmentCount || 0)}条` : "判断库未命中");
    if (Array.isArray(trace.judgmentTransports) && trace.judgmentTransports.length) {
      steps.push(`知识线路:${trace.judgmentTransports.join("+")}`);
    }
  } else {
    steps.push("未查询判断库");
  }
  steps.push("调用远方AI API");
  steps.push(trace?.thinking === "disabled" ? "Thinking关闭" : "Thinking开启");
  if (trace?.reviewEnabled) steps.push(trace?.reviewApplied ? "审核并改写" : "审核通过");
  steps.push("发送文字");
  return steps;
}

const LOGIN_HINTS = ["登录", "扫码", "微信扫一扫", "二维码"];

export class WechatKfPage {
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.selectors = config.selectors ?? {};
  }

  async open() {
    await this.page.goto(this.config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
  }

  async waitUntilReady() {
    for (;;) {
      const text = await this.visibleText();
      if (await this.isWorkbenchReady()) return;

      console.log(`等待进入客服工作台。当前地址：${this.page.url()}`);
      if (LOGIN_HINTS.some((hint) => text.includes(hint))) {
        console.log("如果页面显示二维码、验证码或确认按钮，请先手动完成。");
      } else {
        console.log("如果停在微信小店首页，请确认当前微信号有店铺客服权限，并从后台进入客服。");
      }
      await this.page.waitForTimeout(5000);
    }
  }

  async inspect() {
    const text = await this.visibleText();
    const counts = {};
    for (const [group, selectors] of Object.entries(this.selectors)) {
      counts[group] = {};
      for (const selector of selectors) {
        counts[group][selector] = await this.safeCount(selector);
      }
    }

    return {
      url: this.page.url(),
      title: await this.page.title(),
      text: text.slice(0, 3000),
      counts
    };
  }

  async findNextConversation() {
    const unread = await this.firstVisibleLocator(this.selectors.unreadConversationItems);
    if (unread) return unread;

    if (this.config.processAllVisible) {
      return this.firstVisibleLocator(this.selectors.conversationItems);
    }

    return null;
  }

  async openConversation(locator) {
    await locator.click({ timeout: 10000 });
    await this.page.waitForTimeout(1200);
  }

  async latestCustomerMessage() {
    const latest = await this.latestVisibleTextMessage();
    if (latest && latest.from === "customer") return latest.text;
    if (latest && latest.from === "kf") return "";

    const incomingSelector = await this.firstWorkingSelector(this.selectors.incomingMessages);
    if (incomingSelector) {
      const messages = await this.page.locator(incomingSelector).evaluateAll((nodes) =>
        nodes
          .map((node) => node.innerText || node.textContent || "")
          .map((text) => text.trim())
          .filter(Boolean)
      );
      const last = messages.at(-1);
      if (last) return last;
    }

    const container = await this.firstVisibleLocator(this.selectors.messageContainer);
    if (!container) return "";

    const text = await container.innerText({ timeout: 5000 }).catch(() => "");
    return extractLikelyLatestMessage(text);
  }

  async latestVisibleTextMessage() {
    return this.page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(".text-msg.bg-user, .text-msg.bg-kf"))
        .filter((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length));
      const last = nodes.at(-1);
      if (!last) return null;

      return {
        from: last.classList.contains("bg-user") ? "customer" : "kf",
        text: (last.innerText || last.textContent || "").trim()
      };
    });
  }

  async send(reply) {
    const composer = await this.firstVisibleLocator(this.selectors.composer);
    if (!composer) {
      throw new Error("没有找到输入框，请运行 npm run inspect 后调整 selectors.composer。");
    }

    await composer.click({ timeout: 10000 });
    const tagName = await composer.evaluate((node) => node.tagName.toLowerCase());
    if (tagName === "textarea" || tagName === "input") {
      await composer.fill(reply);
    } else {
      await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await this.page.keyboard.insertText(reply);
    }

    if (this.config.sendMode === "enter") {
      await this.page.keyboard.press("Enter");
      return;
    }

    const button = await this.firstVisibleLocator(this.selectors.sendButton);
    if (!button) {
      throw new Error("没有找到发送按钮。可以把 sendMode 改为 enter，或调整 selectors.sendButton。");
    }

    await button.click({ timeout: 10000 });
  }

  async visibleText() {
    return this.page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  }

  async isWorkbenchReady() {
    const groups = [
      this.selectors.composer,
      this.selectors.conversationItems,
      this.selectors.unreadConversationItems,
      this.selectors.sendButton
    ];

    for (const selectors of groups) {
      for (const selector of selectors ?? []) {
        if ((await this.safeCount(selector)) > 0) return true;
      }
    }
    return false;
  }

  async firstVisibleLocator(selectors = []) {
    for (const selector of selectors) {
      const locator = this.page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count === 0) continue;

      for (let index = 0; index < Math.min(count, 20); index += 1) {
        const item = locator.nth(index);
        if (await item.isVisible().catch(() => false)) return item;
      }
    }
    return null;
  }

  async firstWorkingSelector(selectors = []) {
    for (const selector of selectors) {
      const count = await this.safeCount(selector);
      if (count > 0) return selector;
    }
    return null;
  }

  async safeCount(selector) {
    return this.page.locator(selector).count().catch(() => 0);
  }
}

function extractLikelyLatestMessage(text) {
  const lines = String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !["发送", "按 Enter 发送", "请输入"].includes(line));

  return lines.at(-1) ?? "";
}

# 微信小店客服页结构记录

> 本文定位：微信小店客服页 DOM、selector 和页面动作依据。上级规范：[ARCHITECTURE.md](../ARCHITECTURE.md)，页面自动化改动要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

捕捉时间：2026-06-09
页面：`https://store.weixin.qq.com/shop/kf`

## 会话区

- 会话卡片：`.session-list-card`
- 会话筛选页签：`.session-tab .tab-list-item`
- 当前已验证页签文字：`当前会话`、`全部`

## 聊天输入区

- 文本输入框：`#input-textarea`
- 输入区容器：`.chat-input`
- 图片/视频上传 input：`#file1`
- 文件上传 input：`#file2`
- `#file1` 的 accept：`.jpg,.png,.bmp,.gif,.jpeg,video/*`

图片自动回复当前策略：

1. 优先通过 `#file1` 设置本地图片文件。
2. 等待输入区出现图片预览或发送按钮。
3. 点击聊天输入区里的 `发送`。
4. 如果上传路径失败，回退到剪贴板图片粘贴后发送。

## 右侧面板

- 面板容器：`.extension-panel`
- 一级页签：`.extension-panel .panel-tab .tab-list-item`
- 已验证一级页签：`用户信息`、`商品`、`快捷语`、`素材库`

注意：真实页签节点是 `li.tab-list-item`，自动化匹配必须包含 `li`。

## 商品卡片

- 商品面板：`.product-panel`
- 商品列表卡片：`.product-panel .product-card`
- 每个商品卡片内包含：`商品 ID`、商品名、价格、库存/销量、按钮区。
- 已验证按钮：`邀请下单`、`发商品`

商品动作建议字段：

```json
{
  "type": "product",
  "productId": "10000939487941",
  "button": "发商品",
  "fallbackButton": "邀请下单"
}
```

匹配优先级：

1. `productId`
2. `productName`
3. `query` / `match` / `name`
4. 没有匹配字段时使用面板里第一个商品卡片

## 素材库

- 素材库面板：`.quick-resp-panel`
- 二级页签：`.quick-resp-panel .panel-tab .tab-list-item`
- 已验证二级页签：`直播`、`短视频`、`图片`、`视频`、`文件`
- 当前账号的 `图片` 页签显示：`暂无图片素材`

素材动作建议字段：

```json
{
  "type": "material",
  "subtab": "图片",
  "match": "素材名称",
  "button": "发送"
}
```

如果素材页为空，这条动作会失败，不会误发其它内容。

## 规则示例

商品链接规则：

```json
[
  {
    "name": "发 IP 营销课程商品卡片",
    "enabled": true,
    "keywords": ["IP营销课程", "营销课链接", "2980"],
    "actions": [
      {
        "type": "product",
        "productId": "10000939487941",
        "button": "发商品",
        "fallbackButton": "邀请下单"
      }
    ]
  }
]
```

文本加图片规则：

```json
[
  {
    "name": "发课程说明图片",
    "enabled": true,
    "keywords": ["发图片", "课程图", "介绍图"],
    "actions": [
      {
        "type": "text",
        "text": "我发你看下"
      },
      {
        "type": "image",
        "path": "/absolute/path/to/image.png"
      }
    ]
  }
]
```

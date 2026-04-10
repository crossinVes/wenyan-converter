# 文言文转换器

可部署到 Vercel 的轻量项目，用于：
- 现代中文指令 -> 文言文
- 文言文 -> 现代中文

默认优先调用大模型进行转换；若未配置 `OPENAI_API_KEY` 或上游不可用，会自动回退到本地规则转换。

## 项目结构

```text
wenyan-converter/
  api/
    _lib/
      safety.js
    convert.js
    health.js
  .env.example
  index.html
  package.json
  vercel.json
  README.md
```

## 环境变量

复制 `.env.example` 后按需填写：

```bash
cp .env.example .env
```

- `OPENAI_API_KEY`：可选，不填时走本地规则。
- `OPENAI_BASE_URL`：可选，默认 `https://api.openai.com/v1`。
- `OPENAI_MODEL`：可选，默认 `gpt-4.1-mini`。

## 本地运行

```bash
npm i
npm run start
```

打开：
- `http://localhost:3000`
- 健康检查 `http://localhost:3000/api/health`

## 部署到 Vercel

```bash
npm run deploy
```

生产发布：

```bash
npm run deploy:prod
```

在 Vercel 项目设置中补齐环境变量后再次发布。

## API 用法

### `POST /api/convert`

请求：

```json
{
  "text": "请先总结这段文字，然后给我三条改进建议。",
  "mode": "to_classical"
}
```

返回：

```json
{
  "ok": true,
  "mode": "to_classical",
  "engine": "gpt-4.1-mini",
  "result": "请先撮其大旨，继陈三策以改之。"
}
```

### `GET /api/health`

返回服务状态。

## 安全说明

本项目只做语言风格转换，显式拒绝越狱、规避安全策略、提示词攻击等用途。
安全限制已集中到单文件：`api/_lib/safety.js`，可统一修改：
- `DISALLOWED_INTENT_PATTERNS`：拦截规则
- `DISALLOWED_INTENT_MESSAGE`：拦截返回文案
- `TRANSFORM_SYSTEM_PROMPT`：模型安全系统提示词

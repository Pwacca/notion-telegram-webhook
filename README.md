# Notion → Telegram Webhook

Cloudflare Worker that receives webhook POST requests from Notion database automations and forwards formatted notifications to Telegram.

## Setup

Install dependencies:

```sh
npm install
```

### Local development

Create `.dev.vars` with your secrets:

```
TELEGRAM_BOT_TOKEN=your-bot-token
WEBHOOK_SECRET=your-secret
```

Run locally:

```sh
npm run dev
```

Test with curl:

```sh
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{"source":{"type":"automation"},"data":{"object":"page","id":"test","properties":{"Task name":{"id":"title","type":"title","title":[{"plain_text":"Test ticket"}]},"Status":{"id":"s","type":"status","status":{"name":"In Progress"}}},"url":"https://notion.so/test"}}'
```

### Deploy

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```

### Notion Automation

1. Open your database → Automations → Add automation
2. Set trigger (e.g., "When Status changes")
3. Add action: **Send webhook**
4. URL: `https://notion-telegram-webhook.<your-subdomain>.workers.dev`
5. Add custom header: `X-Webhook-Secret` = your secret
6. Select properties to include

## Configuration

Environment variables in `wrangler.toml`:

| Variable | Description |
|----------|-------------|
| `PERSONAL_CHAT_ID` | Telegram chat ID for personal DM |
| `GROUP_CHAT_ID` | Telegram group chat ID |
| `GROUP_THREAD_ID` | Forum topic thread ID |

Secrets (via `wrangler secret put`):

| Secret | Description |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `WEBHOOK_SECRET` | Shared secret for webhook verification |

## Testing

```sh
npm test
```

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  PERSONAL_CHAT_ID: string;
  GROUP_CHAT_ID: string;
  GROUP_THREAD_ID: string;
}

// --- Notion payload types (based on real "Send webhook" automation payload) ---

interface NotionWebhookPayload {
  source: {
    type: string;
    automation_id: string;
    action_id: string;
    event_id: string;
    attempt: number;
  };
  data: {
    object: string;
    id: string;
    properties: Record<string, NotionProperty>;
    url: string;
    created_time: string;
    last_edited_time: string;
    [key: string]: unknown;
  };
}

interface NotionProperty {
  id: string;
  type: string;
  [key: string]: unknown;
}

// --- Property extraction ---

function extractPropertyValue(prop: NotionProperty): string {
  switch (prop.type) {
    case "title":
      return (prop.title as Array<{ plain_text: string }>)
        ?.map((t) => t.plain_text)
        .join("") || "";
    case "rich_text":
      return (prop.rich_text as Array<{ plain_text: string }>)
        ?.map((t) => t.plain_text)
        .join("") || "";
    case "select":
      return (prop.select as { name: string } | null)?.name ?? "";
    case "status":
      return (prop.status as { name: string } | null)?.name ?? "";
    case "multi_select":
      return (prop.multi_select as Array<{ name: string }>)
        ?.map((s) => s.name)
        .join(", ") || "";
    case "date":
      return (prop.date as { start: string } | null)?.start ?? "";
    case "people":
      return (prop.people as Array<{ name: string }>)
        ?.map((p) => p.name)
        .join(", ") || "";
    case "checkbox":
      return (prop.checkbox as boolean) ? "Yes" : "No";
    case "number":
      return String(prop.number ?? "");
    case "url":
      return (prop.url as string) ?? "";
    case "email":
      return (prop.email as string) ?? "";
    case "relation":
      return (prop.relation as Array<{ id: string }>)
        ?.length
        ? `${(prop.relation as Array<{ id: string }>).length} linked`
        : "";
    default:
      return "";
  }
}

// --- HTML escaping ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Message formatting ---

function formatMessage(payload: NotionWebhookPayload): string {
  const props = payload.data.properties;
  const pageUrl = payload.data.url;

  // Find title property
  const titleKey = Object.keys(props).find((k) => props[k].type === "title");
  const title = titleKey ? extractPropertyValue(props[titleKey]) : "Untitled";

  // Format other properties (skip empty and title)
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(props)) {
    if (key === titleKey) continue;
    const value = extractPropertyValue(prop);
    if (!value) continue;
    lines.push(`<b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`);
  }

  const parts = [
    `<b>${escapeHtml(title)}</b>`,
    "",
    ...lines,
  ];

  if (pageUrl) {
    parts.push("", `<a href="${pageUrl}">Open in Notion</a>`);
  }

  return parts.join("\n");
}

// --- Telegram sender ---

async function sendTelegram(
  token: string,
  chatId: string,
  threadId: string | null,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (threadId) {
    body.message_thread_id = parseInt(threadId, 10);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API ${response.status}: ${error}`);
  }
}

// --- Secret verification (timing-safe) ---

function verifySecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Main handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Verify webhook secret
    if (env.WEBHOOK_SECRET) {
      const provided = request.headers.get("X-Webhook-Secret") ?? "";
      if (!verifySecret(provided, env.WEBHOOK_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Parse body
    let payload: NotionWebhookPayload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Bad Request: invalid JSON", { status: 400 });
    }

    // Validate structure
    if (!payload?.data?.properties) {
      return new Response("Bad Request: missing data.properties", { status: 400 });
    }

    // Format message
    const message = formatMessage(payload);

    // Send to both destinations in parallel
    const results = await Promise.allSettled([
      sendTelegram(env.TELEGRAM_BOT_TOKEN, env.PERSONAL_CHAT_ID, null, message),
      sendTelegram(env.TELEGRAM_BOT_TOKEN, env.GROUP_CHAT_ID, env.GROUP_THREAD_ID, message),
    ]);

    const failures = results.filter((r) => r.status === "rejected");

    if (failures.length === results.length) {
      // Both failed
      const errors = failures.map((f) => (f as PromiseRejectedResult).reason);
      console.error("All Telegram sends failed:", errors);
      return new Response("All sends failed", { status: 502 });
    }

    if (failures.length > 0) {
      // Partial failure
      const errors = failures.map((f) => (f as PromiseRejectedResult).reason);
      console.warn("Partial Telegram send failure:", errors);
    }

    return new Response("OK", { status: 200 });
  },
};

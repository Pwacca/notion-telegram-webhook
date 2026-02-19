export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
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

interface NotionPerson {
  object: string;
  id: string;
  name: string;
  type?: string;
  person?: { email?: string };
}

// --- Notion User ID → Telegram username mapping ---

const USER_MAP: Record<string, string> = {
  // Luka Haikin
  "1b3d872b-594c-819a-9bac-0002bd327ff7": "Pwacca",
  // Vahe Kirakosyan
  "224d872b-594c-8161-b365-0002f5424106": "kirvahe",
  // Sergey Kurlovich
  "1e0d872b-594c-81a6-bb93-0002880a133d": "skurlovich",
  // Mikhail Semenov
  "537ce164-c88c-45b2-bafb-7ecf49ed5527": "m5s5v",
  // Дмитрий Сундуков
  "268072ef-0c99-4c74-97c0-f16e138e0e24": "IamAfroman",
  // Alina Polinko
  "27dd872b-594c-8173-974c-000220a3d840": "polinko_alina",
};

// Fallback: match by name if user ID not in map
const NAME_MAP: Record<string, string> = {
  "Luka Haikin": "Pwacca",
  "Vahe Kirakosyan": "kirvahe",
  "Sergey Kurlovich": "skurlovich",
  "Mikhail Semenov": "m5s5v",
  "Дмитрий Сундуков": "IamAfroman",
  "Alina Polinko": "polinko_alina",
  "Pavel Shumkovskii": "pavelhym",
  "Шумковский Павел": "pavelhym",
  "Elena Kotlyar": "ekotlyar",
  "Котляр Елена": "ekotlyar",
  "Alexander Donskikh": "alexdonskikh",
  "Донских Александр": "alexdonskikh",
  "Дмитрий Борисов": "Gallywix",
  "Dmitry Borisov": "Gallywix",
};

function resolveUsername(person: NotionPerson): string | null {
  // Try by Notion user ID first
  const byId = USER_MAP[person.id];
  if (byId) return byId;

  // Fallback by name
  const byName = NAME_MAP[person.name];
  if (byName) return byName;

  return null;
}

// --- Property extraction ---

function extractTitle(props: Record<string, NotionProperty>): string {
  const titleKey = Object.keys(props).find((k) => props[k].type === "title");
  if (!titleKey) return "Untitled";
  return (props[titleKey].title as Array<{ plain_text: string }>)
    ?.map((t) => t.plain_text)
    .join("") || "Untitled";
}

function extractStatus(props: Record<string, NotionProperty>): string {
  const statusProp = props["Status"];
  if (!statusProp) return "";
  if (statusProp.type === "status") {
    return (statusProp.status as { name: string } | null)?.name ?? "";
  }
  if (statusProp.type === "select") {
    return (statusProp.select as { name: string } | null)?.name ?? "";
  }
  return "";
}

function extractReviewers(props: Record<string, NotionProperty>): NotionPerson[] {
  const reviewerProp = props["Reviewer"];
  if (!reviewerProp || reviewerProp.type !== "people") return [];
  return (reviewerProp.people as NotionPerson[]) || [];
}

// --- HTML escaping ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Message formatting (AID Nightend style) ---

function formatMessage(payload: NotionWebhookPayload): string {
  const props = payload.data.properties;
  const pageUrl = payload.data.url;

  const title = extractTitle(props);
  const status = extractStatus(props);
  const reviewers = extractReviewers(props);

  const parts: string[] = [];

  // Title as hyperlink (like AID Nightend)
  if (pageUrl) {
    parts.push(`<a href="${pageUrl}">${escapeHtml(title)}</a>`);
  } else {
    parts.push(`<b>${escapeHtml(title)}</b>`);
  }

  // Status line
  if (status) {
    parts.push(`Статус: ${escapeHtml(status)}`);
  }

  // Tag reviewers
  for (const reviewer of reviewers) {
    const username = resolveUsername(reviewer);
    if (username) {
      parts.push(`@${username}`);
    } else {
      parts.push(escapeHtml(reviewer.name));
    }
  }

  return parts.join("\n");
}

// --- Telegram sender ---

async function sendTelegram(
  token: string,
  chatId: string,
  threadId: string,
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

    // Send to group chat only
    try {
      await sendTelegram(
        env.TELEGRAM_BOT_TOKEN,
        env.GROUP_CHAT_ID,
        env.GROUP_THREAD_ID,
        message,
      );
    } catch (err) {
      console.error("Telegram send failed:", err);
      return new Response("Telegram send failed", { status: 502 });
    }

    return new Response("OK", { status: 200 });
  },
};

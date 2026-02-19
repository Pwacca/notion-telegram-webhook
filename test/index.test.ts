import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// Real payload captured from Notion automation
const REAL_PAYLOAD = {
  source: {
    type: "automation",
    automation_id: "30c91cc9-11b2-80bc-a0f0-004d5cca633a",
    action_id: "30c91cc9-11b2-8071-98ac-005a4ae0b9ca",
    event_id: "ef85a8cd-f835-4c46-8b4b-7799cc984aa6",
    attempt: 1,
  },
  data: {
    object: "page",
    id: "30c91cc9-11b2-800f-88b3-c19e259aa75b",
    created_time: "2026-02-19T12:38:00.000Z",
    last_edited_time: "2026-02-19T12:38:00.000Z",
    created_by: { object: "user", id: "1b3d872b-594c-819a-9bac-0002bd327ff7" },
    last_edited_by: { object: "user", id: "00000000-0000-0000-0000-000000000003" },
    cover: null,
    icon: { type: "external", external: { url: "https://www.notion.so/icons/checkmark_green.svg" } },
    parent: {
      type: "data_source_id",
      data_source_id: "23e91cc9-11b2-80ec-aef7-000b3009551c",
      database_id: "23e91cc9-11b2-8014-a279-c5b988a05e1f",
    },
    archived: false,
    in_trash: false,
    is_locked: false,
    properties: {
      "Task name": {
        id: "title",
        type: "title",
        title: [
          {
            type: "text",
            text: { content: "тест", link: null },
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
            plain_text: "тест",
            href: null,
          },
        ],
      },
      Asignee: {
        id: "YxM%7B",
        type: "people",
        people: [
          {
            object: "user",
            id: "1b3d872b-594c-819a-9bac-0002bd327ff7",
            name: "Luka Haikin",
            avatar_url: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/4c8ba85d-7a2f-4156-be9c-7613825f3823/733deaba-3888-483d-80b1-671f18173836.png",
            type: "person",
            person: { email: "pwacca@skms.io" },
          },
        ],
      },
      Reviewer: {
        id: "dHT%5D",
        type: "people",
        people: [],
      },
      Status: {
        id: "Q%7Cp%3B",
        type: "status",
        status: { id: "AWQQ", name: "Briefing", color: "blue" },
      },
    },
    url: "https://www.notion.so/30c91cc911b2800f88b3c19e259aa75b",
    public_url: null,
    request_id: "d3aae134-2c7b-44e0-99c9-5315d20ded9f",
  },
};

function makeRequest(options: {
  method?: string;
  body?: unknown;
  secret?: string;
} = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.secret) {
    headers["X-Webhook-Secret"] = options.secret;
  }
  return new Request("http://localhost", {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe("Notion Telegram Webhook Worker", () => {
  it("returns 405 for non-POST requests", async () => {
    const resp = await SELF.fetch("http://localhost", { method: "GET" });
    expect(resp.status).toBe(405);
  });

  it("returns 401 for missing secret header", async () => {
    const resp = await SELF.fetch(makeRequest({ body: REAL_PAYLOAD }));
    expect(resp.status).toBe(401);
  });

  it("returns 401 for wrong secret", async () => {
    const resp = await SELF.fetch(
      makeRequest({ body: REAL_PAYLOAD, secret: "wrong-secret" }),
    );
    expect(resp.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const resp = await SELF.fetch(
      new Request("http://localhost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": env.WEBHOOK_SECRET,
        },
        body: "not-json{{{",
      }),
    );
    expect(resp.status).toBe(400);
  });

  it("returns 400 for payload without data.properties", async () => {
    const resp = await SELF.fetch(
      makeRequest({ body: { source: {}, data: {} }, secret: env.WEBHOOK_SECRET }),
    );
    expect(resp.status).toBe(400);
  });

  it("processes real Notion payload and returns 200 or 502", async () => {
    // Telegram API won't be available in tests, so we expect either:
    // - 200 if fetch is somehow mocked/succeeds
    // - 502 if both Telegram sends fail (expected in test env)
    const resp = await SELF.fetch(
      makeRequest({ body: REAL_PAYLOAD, secret: env.WEBHOOK_SECRET }),
    );
    // In test environment without real Telegram, both sends will fail → 502
    expect([200, 502]).toContain(resp.status);
  });
});

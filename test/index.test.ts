import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// Real payload captured from Notion automation (with Reviewer added)
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
    parent: {
      type: "data_source_id",
      data_source_id: "23e91cc9-11b2-80ec-aef7-000b3009551c",
    },
    properties: {
      "Task name": {
        id: "title",
        type: "title",
        title: [{ type: "text", plain_text: "Отдать Азбуке тикет по airflow", href: null }],
      },
      Status: {
        id: "Q%7Cp%3B",
        type: "status",
        status: { id: "done", name: "Done", color: "green" },
      },
      Reviewer: {
        id: "dHT%5D",
        type: "people",
        people: [
          {
            object: "user",
            id: "224d872b-594c-8161-b365-0002f5424106",
            name: "Vahe Kirakosyan",
            type: "person",
            person: { email: "vk@skms.io" },
          },
        ],
      },
    },
    url: "https://www.notion.so/30c91cc911b2800f88b3c19e259aa75b",
    public_url: null,
  },
};

describe("Notion Telegram Webhook Worker", () => {
  it("returns 405 for non-POST requests", async () => {
    const resp = await SELF.fetch("http://localhost", { method: "GET" });
    expect(resp.status).toBe(405);
  });

  it("returns 401 for missing secret header", async () => {
    const resp = await SELF.fetch(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REAL_PAYLOAD),
    }));
    expect(resp.status).toBe(401);
  });

  it("returns 401 for wrong secret", async () => {
    const resp = await SELF.fetch(new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "wrong-secret",
      },
      body: JSON.stringify(REAL_PAYLOAD),
    }));
    expect(resp.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const resp = await SELF.fetch(new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.WEBHOOK_SECRET,
      },
      body: "not-json{{{",
    }));
    expect(resp.status).toBe(400);
  });

  it("returns 400 for payload without data.properties", async () => {
    const resp = await SELF.fetch(new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.WEBHOOK_SECRET,
      },
      body: JSON.stringify({ source: {}, data: {} }),
    }));
    expect(resp.status).toBe(400);
  });

  it("processes real payload (returns 200 or 502 depending on Telegram)", async () => {
    const resp = await SELF.fetch(new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.WEBHOOK_SECRET,
      },
      body: JSON.stringify(REAL_PAYLOAD),
    }));
    // 200 if Telegram succeeds, 502 if it fails (test env)
    expect([200, 502]).toContain(resp.status);
  });
});

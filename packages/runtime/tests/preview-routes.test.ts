import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  handlePreviewRoute,
  hasInternalPreviewAccess,
} from "../src/server/routes/previews";

const originalEnv = {
  JAM_ID: process.env.JAM_ID,
  JAM_SHARED_SECRET: process.env.JAM_SHARED_SECRET,
  COORDINATION_BASE_URL: process.env.COORDINATION_BASE_URL,
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.JAM_ID = "abc123";
  process.env.JAM_SHARED_SECRET = "runtime-secret";
  process.env.COORDINATION_BASE_URL = "https://letsjam.now";
});

afterEach(() => {
  process.env.JAM_ID = originalEnv.JAM_ID;
  process.env.JAM_SHARED_SECRET = originalEnv.JAM_SHARED_SECRET;
  process.env.COORDINATION_BASE_URL = originalEnv.COORDINATION_BASE_URL;
  globalThis.fetch = originalFetch;
});

describe("runtime preview routes", () => {
  test("recognizes internal preview access via the shared secret header", () => {
    expect(
      hasInternalPreviewAccess(
        new Request("http://localhost:7681/api/previews", {
          headers: { "x-jam-shared-secret": "runtime-secret" },
        }),
      ),
    ).toBe(true);
  });

  test("forwards preview creation to coordination with the jam shared secret", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://letsjam.now/api/internal/jams/abc123/previews");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-jam-shared-secret")).toBe("runtime-secret");
      expect(init?.body).toBe(JSON.stringify({ port: 3000, label: "app" }));

      return Response.json({
        id: "preview1",
        host: "preview1.previews.letsjam.now",
        url: "https://preview1.previews.letsjam.now",
        port: 3000,
        accessMode: "public",
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const response = await handlePreviewRoute(
      new Request("http://localhost:7681/api/previews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jam-shared-secret": "runtime-secret",
        },
        body: JSON.stringify({ port: 3000, label: "app" }),
      }),
      new URL("http://localhost:7681/api/previews"),
      null,
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      host: "preview1.previews.letsjam.now",
      port: 3000,
    });
  });

  test("allows authenticated browser users to list previews", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        previews: [
          {
            id: "preview1",
            host: "preview1.previews.letsjam.now",
            port: 3000,
          },
        ],
      }),
    ) as typeof globalThis.fetch;

    const response = await handlePreviewRoute(
      new Request("https://abc123.jams.letsjam.now/api/previews"),
      new URL("https://abc123.jams.letsjam.now/api/previews"),
      {
        id: "user_1",
        email: "jam@example.com",
        login: "jam",
        name: "Jam",
        avatar_url: "",
      },
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      previews: [
        {
          host: "preview1.previews.letsjam.now",
          port: 3000,
        },
      ],
    });
  });
});

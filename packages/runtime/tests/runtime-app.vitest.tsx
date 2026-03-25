import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RuntimeApp } from "../src/web/RuntimeApp";
import type { RuntimeBootstrap } from "../src/web/types";

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options: Record<string, unknown>;
    rows = 24;
    element: HTMLDivElement | null = null;
    buffer = {
      active: {
        viewportY: 0,
        baseY: 0,
        getLine() {
          return null;
        },
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }

    loadAddon() {}

    open(container: HTMLDivElement) {
      this.element = document.createElement("div");
      container.appendChild(this.element);
    }

    onData() {}

    scrollLines() {}

    scrollToBottom() {}

    focus() {}

    clear() {}

    reset() {}

    write(_data: string, callback?: () => void) {
      callback?.();
    }

    dispose() {}
  },
}));

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

class MockNotification {
  static permission: NotificationPermission = "denied";

  static requestPermission() {
    return Promise.resolve("denied" as NotificationPermission);
  }

  onclick: (() => void) | null = null;

  constructor(_title: string, _options?: NotificationOptions) {}

  close() {}
}

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {}

  send() {}
  close() {}
}

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  } as Response;
}

describe("RuntimeApp", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("resumes a disk session with the derived session name override", async () => {
    const firstMessage = "Resume this very long disk session title from Claude";

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/disk-sessions") {
        return jsonResponse([
          {
            claudeSessionId: "claude-session-12345678",
            project: "demo-project",
            firstMessage,
            timestamp: "2026-03-24T00:00:00.000Z",
            lastModified: "2026-03-24T00:00:00.000Z",
          },
        ]);
      }

      if (url === "/api/sessions" && init?.method === "POST") {
        return jsonResponse({ id: "session-2" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    const bootstrap: RuntimeBootstrap = {
      initialUser: {
        id: "user-1",
        email: "jam@example.com",
        login: "jam-owner",
        name: "Jam Owner",
        avatar_url: "",
      },
      requestedSessionId: null,
    };

    render(<RuntimeApp bootstrap={bootstrap} />);

    expect(screen.getByText(/pick a session above or start a new one/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new session/i }));

    expect(await screen.findByText(/resume from disk/i)).toBeInTheDocument();

    const resumeButton = screen.getByText(firstMessage).closest("button");
    expect(resumeButton).not.toBeNull();

    await user.click(resumeButton!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const createCall = fetchMock.mock.calls[1];
    expect(createCall[0]).toBe("/api/sessions");
    expect(createCall[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const body = JSON.parse(String((createCall[1] as RequestInit).body));
    expect(body.name).toBe(firstMessage.slice(0, 30));
    expect(body.resumeId).toBe("claude-session-12345678");
  });
});

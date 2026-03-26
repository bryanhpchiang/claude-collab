import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RuntimeApp } from "../src/web/RuntimeApp";
import type { RuntimeBootstrap } from "../src/web/types";

const terminalWrites: string[] = [];
let terminalConstructorCount = 0;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);
const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);

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
      terminalConstructorCount += 1;
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
      terminalWrites.push(_data);
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
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  sent: string[] = [];

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }
  close() {}

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
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
    MockWebSocket.instances = [];
    terminalWrites.splice(0);
    terminalConstructorCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/health") return jsonResponse({ ok: true });
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 100;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 100;
      },
    });
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
    cleanup();
    if (typeof localStorage?.clear === "function") localStorage.clear();
    history.replaceState(null, "", "/");
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeightDescriptor);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
    }
    vi.unstubAllGlobals();
  });

  test("creates a fresh session when the new tab button is clicked", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/health") {
        return jsonResponse({ ok: true });
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
      jamName: null,
      requestedSessionId: null,
    };

    render(<RuntimeApp bootstrap={bootstrap} />);

    await user.click(screen.getByRole("button", { name: "+" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) =>
          input === "/api/sessions" && (init as RequestInit | undefined)?.method === "POST"),
      ).toBe(true);
    });

    const createCall = fetchMock.mock.calls.find(([input, init]) =>
      input === "/api/sessions" && (init as RequestInit | undefined)?.method === "POST");
    expect(createCall).toBeTruthy();
    if (!createCall) throw new Error("Missing session creation request");
    expect(createCall[0]).toBe("/api/sessions");
    expect(createCall[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const body = JSON.parse(String((createCall[1] as RequestInit).body));
    expect(body.name).toMatch(/^Tab /);
    expect(body.resumeId).toBeUndefined();
  });

  test("auto-joins the default session and writes runtime output to the terminal", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/health") return jsonResponse({ ok: true });
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const bootstrap: RuntimeBootstrap = {
      initialUser: {
        id: "user-1",
        email: "jam@example.com",
        login: "jam-owner",
        name: "Jam Owner",
        avatar_url: "",
      },
      jamName: null,
      requestedSessionId: null,
    };

    render(<RuntimeApp bootstrap={bootstrap} />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.emitOpen();
    });

    act(() => {
      socket.emitMessage({
        type: "projects",
        projects: [
          {
            id: "project-1",
            name: "Default",
            cwd: "/tmp",
            sessionCount: 1,
            createdAt: Date.now(),
            sessions: [
              {
                id: "session-1",
                name: "General",
                projectId: "project-1",
                users: [],
                createdAt: Date.now(),
              },
            ],
          },
        ],
        sessions: [
          {
            id: "session-1",
            name: "General",
            projectId: "project-1",
            users: [],
            createdAt: Date.now(),
          },
        ],
      });
    });

    expect((await screen.findAllByText(/general/i)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        socket.sent.some((payload) => JSON.parse(payload).type === "join-session"),
      ).toBe(true);
    });

    act(() => {
      socket.emitMessage({ type: "users", users: ["jam-owner"] });
    });

    act(() => {
      socket.emitMessage({ type: "output", data: "Claude booted" });
    });

    expect(terminalConstructorCount).toBe(1);
    expect(screen.getByText(/general/i)).toBeInTheDocument();
  });

  test("loads and auto-joins sessions even before the terminal reports ready", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/health") return jsonResponse({ ok: true });
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const widthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    const heightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 0;
      },
    });

    try {
      const bootstrap: RuntimeBootstrap = {
        initialUser: {
          id: "user-1",
          email: "jam@example.com",
          login: "jam-owner",
          name: "Jam Owner",
          avatar_url: "",
        },
        jamName: null,
        requestedSessionId: null,
      };

      render(<RuntimeApp bootstrap={bootstrap} />);

      await waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });

      const socket = MockWebSocket.instances[0];

      act(() => {
        socket.emitOpen();
        socket.emitMessage({
          type: "projects",
          projects: [
            {
              id: "project-1",
              name: "Default",
              cwd: "/tmp",
              sessionCount: 1,
              createdAt: Date.now(),
              sessions: [
                {
                  id: "session-1",
                  name: "General",
                  projectId: "project-1",
                  users: [],
                  createdAt: Date.now(),
                },
              ],
            },
          ],
          sessions: [
            {
              id: "session-1",
              name: "General",
              projectId: "project-1",
              users: [],
              createdAt: Date.now(),
            },
          ],
        });
      });

      expect((await screen.findAllByText(/general/i)).length).toBeGreaterThan(0);

      await waitFor(() => {
        expect(
          socket.sent.some((payload) => JSON.parse(payload).type === "join-session"),
        ).toBe(true);
      });
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", widthDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
      }

      if (heightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", heightDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
      }
    }
  });

  test("keeps new tabs visible when session creation succeeds before websocket connect", async () => {
    let sessionFetchCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/health") {
        return jsonResponse({ ok: true });
      }

      if (url === "/api/sessions" && !init?.method) {
        sessionFetchCount += 1;
        return jsonResponse(sessionFetchCount > 1 ? [
          {
            id: "session-1",
            name: "General",
            projectId: "project-1",
            users: [],
            createdAt: 1,
          },
          {
            id: "session-2",
            name: "Tab 9:31 PM",
            projectId: "project-1",
            users: [],
            createdAt: 2,
          },
        ] : [
          {
            id: "session-1",
            name: "General",
            projectId: "project-1",
            users: [],
            createdAt: 1,
          },
        ]);
      }

      if (url === "/api/projects" && !init?.method) {
        return jsonResponse([
          {
            id: "project-1",
            name: "Default",
            cwd: "/tmp",
            sessionCount: sessionFetchCount > 1 ? 2 : 1,
            createdAt: 1,
            sessions: [],
          },
        ]);
      }

      if (url === "/api/projects/project-1/sessions" && init?.method === "POST") {
        return jsonResponse({
          id: "session-2",
          name: "Tab 9:31 PM",
          projectId: "project-1",
        });
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
      jamName: null,
      requestedSessionId: null,
    };

    const { container } = render(<RuntimeApp bootstrap={bootstrap} />);

    expect((await screen.findAllByText("General")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "+" }));

    expect(await screen.findByText("Tab 9:31 PM")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe("?s=session-2");
    });
    expect(container.querySelector('.session-tab.active .tab-name')?.textContent).toBe("Tab 9:31 PM");
  });
});

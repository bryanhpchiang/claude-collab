import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DashboardPage } from "../src/web/pages/DashboardPage";
import { LandingPage } from "../src/web/pages/LandingPage";

function jsonResponse(
  payload: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  } as Response;
}

describe("Coordination App", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("renders the landing page CTA", () => {
    render(<LandingPage signedIn={false} authEnabled={true} />);

    expect(screen.getByRole("link", { name: /start a jam/i })).toHaveAttribute(
      "href",
      "/auth/github",
    );
    expect(screen.getByPlaceholderText(/paste a jam id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join/i })).toBeInTheDocument();
  });

  test("opens the access modal for a dashboard jam", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/jams/jam-1/members") {
        return jsonResponse({
          members: [
            {
              user_id: "user-1",
              login: "jam-owner",
              name: "Jam Owner",
              avatar_url: "",
            },
          ],
          inviteLinks: [],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();

    render(
      <DashboardPage
        user={{
          id: "user-1",
          email: "jam@example.com",
          login: "jam-owner",
          name: "Jam Owner",
          avatar_url: "",
        }}
        initialJams={[
          {
            id: "jam-1",
            instanceId: "i-123",
            url: "https://jam.example.com",
            state: "running",
            creator: {
              user_id: "user-1",
              login: "jam-owner",
              name: "Jam Owner",
              avatar_url: "",
            },
            created_at: new Date().toISOString(),
            name: "Alpha Jam",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /manage/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/jams/jam-1/members");
    });

    expect(
      await screen.findByRole("heading", { name: /alpha jam/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create invite link/i }),
    ).toBeInTheDocument();
  });

  test("restarts a stuck jam after terminating it", async () => {
    let jamsCallCount = 0;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/jams/jam-1" && init?.method === "DELETE") {
          return jsonResponse({});
        }

        if (url === "/api/jams" && !init?.method) {
          jamsCallCount += 1;
          return jsonResponse(
            jamsCallCount === 1
              ? []
              : [
                  {
                    id: "jam-2",
                    instanceId: "i-456",
                    url: "https://jam-2.example.com",
                    state: "running",
                    creator: {
                      user_id: "user-1",
                      login: "jam-owner",
                      name: "Jam Owner",
                      avatar_url: "",
                    },
                    created_at: new Date().toISOString(),
                    name: "Alpha Jam",
                  },
                ],
          );
        }

        if (url === "/api/jams" && init?.method === "POST") {
          return jsonResponse({});
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    const user = userEvent.setup();

    render(
      <DashboardPage
        user={{
          id: "user-1",
          email: "jam@example.com",
          login: "jam-owner",
          name: "Jam Owner",
          avatar_url: "",
        }}
        initialJams={[
          {
            id: "jam-1",
            instanceId: "i-123",
            url: null,
            state: "pending",
            creator: {
              user_id: "user-1",
              login: "jam-owner",
              name: "Jam Owner",
              avatar_url: "",
            },
            created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
            name: "Alpha Jam",
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /terminate & start over/i }),
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/jams" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/jams" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(
      JSON.parse(String((postCall?.[1] as RequestInit).body)),
    ).toMatchObject({
      name: "Alpha Jam",
    });
  });

  test("rotates the playful loading label for pending jams", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T21:00:00.000Z"));

    render(
      <DashboardPage
        user={{
          id: "user-1",
          email: "jam@example.com",
          login: "jam-owner",
          name: "Jam Owner",
          avatar_url: "",
        }}
        initialJams={[
          {
            id: "jam-1",
            instanceId: "i-123",
            url: null,
            state: "pending",
            creator: {
              user_id: "user-1",
              login: "jam-owner",
              name: "Jam Owner",
              avatar_url: "",
            },
            created_at: "2026-03-24T21:00:00.000Z",
            name: "Alpha Jam",
          },
        ]}
      />,
    );

    expect(screen.getByText("Smearing...")).toBeInTheDocument();
    expect(
      screen.getByText(/waiting for the jam environment/i),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText("Toasting...")).toBeInTheDocument();
  });
});

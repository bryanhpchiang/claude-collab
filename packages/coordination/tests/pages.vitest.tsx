import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DashboardPage } from "../src/web/pages/DashboardPage";
import { LandingPage } from "../src/web/pages/LandingPage";

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
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
    vi.unstubAllGlobals();
  });

  test("renders the landing page CTA", () => {
    render(<LandingPage signedIn={false} authEnabled={true} />);

    expect(screen.getByRole("link", { name: /start a jam/i })).toHaveAttribute("href", "/auth/github");
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

    expect(await screen.findByRole("heading", { name: /alpha jam/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create invite link/i })).toBeInTheDocument();
  });
});

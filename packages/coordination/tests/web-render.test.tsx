import { expect, test } from "bun:test";
import { renderCoordinationPage } from "../src/server/web-render";

const baseConfig = {
  staticDir: "/tmp/coordination-web",
  webClientEntries: {
    landing: "src/web/landing.client.tsx",
    dashboard: "src/web/dashboard.client.tsx",
  },
  webManifestPath: "/tmp/coordination-web/.vite/manifest.json",
  webDevServerUrl: "",
} as any;

test("renderCoordinationPage renders the landing shell", async () => {
  const html = await renderCoordinationPage(baseConfig, {
    bootstrap: {
      page: "landing",
      signedIn: false,
      authEnabled: true,
    },
  });

  expect(html).toContain('id="jam-coordination-bootstrap"');
  expect(html).not.toContain("window.__JAM_COORDINATION__");
  expect(html).toContain("Start a Jam");
  expect(html).toContain("Join");
});

test("renderCoordinationPage renders dashboard content from bootstrap", async () => {
  const html = await renderCoordinationPage(baseConfig, {
    bootstrap: {
      page: "dashboard",
      user: {
        id: "user-1",
        email: "jam@example.com",
        login: "jam",
        name: "Jam User",
        avatar_url: "",
      },
      jams: [
        {
          id: "jam1",
          instanceId: "i-123",
          url: "https://jam.example.com",
          state: "running",
          creator: {
            user_id: "user-1",
            login: "jam",
            name: "Jam User",
            avatar_url: "",
          },
          created_at: new Date().toISOString(),
          name: "My Jam",
        },
      ],
    },
  });

  expect(html).toContain('id="jam-coordination-bootstrap"');
  expect(html).not.toContain("window.__JAM_COORDINATION__");
  expect(html).toContain("Your Jams");
  expect(html).toContain("My Jam");
});

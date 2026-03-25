import { expect, test } from "bun:test";
import { renderRuntimeApp } from "../src/server/static-app";

test("renderRuntimeApp injects bootstrap data and app shell", async () => {
  process.env.JAM_NAME = "";
  const response = await renderRuntimeApp({
    id: "user-1",
    email: "octo@example.com",
    login: "octocat",
    name: "Octo Cat",
    avatar_url: "",
  }, "session-123");

  const html = await response.text();

  expect(html).toContain('id="jam-runtime-bootstrap"');
  expect(html).not.toContain("window.__JAM_RUNTIME__");
  expect(html).toContain("octocat");
  expect(html).toContain("session-123");
  expect(html).toContain("STATE");
});

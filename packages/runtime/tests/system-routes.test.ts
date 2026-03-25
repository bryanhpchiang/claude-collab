import { describe, expect, test } from "bun:test";
import { WORKSPACE_ROOT } from "../src/config";
import {
  getRuntimeDeploySteps,
  getRuntimeStartCommand,
} from "../src/server/routes/system";

describe("runtime deploy workflow", () => {
  test("updates the workspace checkout before restarting the runtime", () => {
    const bunPath = "/tmp/bun";

    expect(getRuntimeDeploySteps(bunPath)).toEqual([
      {
        label: "pull latest code",
        args: ["git", "pull", "origin", "main"],
        cwd: WORKSPACE_ROOT,
      },
      {
        label: "install dependencies",
        args: [bunPath, "install", "--frozen-lockfile"],
        cwd: WORKSPACE_ROOT,
      },
    ]);

    expect(getRuntimeStartCommand(bunPath)).toEqual({
      label: "restart runtime",
      args: [bunPath, "run", "runtime:start"],
      cwd: WORKSPACE_ROOT,
    });
  });

  test("builds web assets before starting the runtime package", async () => {
    const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.start).toContain("web:build");
    expect(pkg.scripts?.dev).toContain("web:build");
  });
});

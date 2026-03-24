import { describe, expect, test } from "bun:test";
import { resolveProjectCwd } from "../src/project-paths";

describe("resolveProjectCwd", () => {
  const homeDir = "/Users/sofiane";
  const defaultCwd = "/Users/sofiane/projects/demo";

  test("uses the fallback when no cwd is provided", () => {
    expect(resolveProjectCwd(undefined, { defaultCwd, homeDir })).toBe(defaultCwd);
  });

  test("expands ~ to the user's home directory", () => {
    expect(resolveProjectCwd("~/test", { defaultCwd, homeDir })).toBe("/Users/sofiane/test");
  });

  test("returns the home directory for bare ~", () => {
    expect(resolveProjectCwd("~", { defaultCwd, homeDir })).toBe("/Users/sofiane");
  });

  test("leaves absolute paths unchanged", () => {
    expect(resolveProjectCwd("/tmp/demo", { defaultCwd, homeDir })).toBe("/tmp/demo");
  });

  test("resolves relative paths from the provided base directory", () => {
    expect(resolveProjectCwd("test", { defaultCwd, homeDir, baseDir: homeDir })).toBe("/Users/sofiane/test");
  });
});

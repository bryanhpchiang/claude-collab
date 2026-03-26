import { describe, expect, test } from "bun:test";
import {
  buildTemplateBuildCommands,
  buildTemplateCheckoutCommands,
} from "./build-e2b-template";

describe("buildTemplateCheckoutCommands", () => {
  test("fetches an arbitrary git ref without treating it as a branch name", () => {
    const repoRef = "c11a2ba1cab63d6cc25bbb76a1ade3243a3c5d30";
    const commands = buildTemplateCheckoutCommands({
      repoUrl: "https://github.com/bryanhpchiang/claude-collab.git",
      repoRef,
      installDir: "/home/user/jam",
    });

    expect(commands).toEqual([
      "git init -q '/home/user/jam'",
      "git -C '/home/user/jam' remote add origin 'https://github.com/bryanhpchiang/claude-collab.git'",
      `git -C '/home/user/jam' fetch --depth 1 origin '${repoRef}'`,
      "git -C '/home/user/jam' checkout --detach FETCH_HEAD",
    ]);
  });
});

describe("buildTemplateBuildCommands", () => {
  test("builds the runtime template from a fetched checkout", () => {
    const commands = buildTemplateBuildCommands({
      repoUrl: "https://github.com/bryanhpchiang/claude-collab.git",
      repoRef: "main",
      installDir: "/home/user/jam",
      gitUserName: "Jam",
      gitUserEmail: "jam@letsjam.now",
    });

    expect(commands).not.toContain(
      "git clone --branch 'main' --depth 1 'https://github.com/bryanhpchiang/claude-collab.git' '/home/user/jam'",
    );
    expect(commands).toContain(
      "cd '/home/user/jam' && bun install --frozen-lockfile --production --filter @jam/runtime",
    );
    expect(commands).toContain(
      "cd '/home/user/jam' && bun run runtime:web:build",
    );
  });
});

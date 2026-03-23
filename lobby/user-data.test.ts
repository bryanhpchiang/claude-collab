import { describe, expect, test } from "bun:test";
import { buildJamInstanceUserData, buildJamInstanceUserDataScript } from "./user-data";

describe("buildJamInstanceUserDataScript", () => {
  test("configures git identity as the ubuntu user after chowning the repo", () => {
    const script = buildJamInstanceUserDataScript();

    expect(script).toContain("chown -R ubuntu:ubuntu /opt/jam");
    expect(script).toContain(
      `su - ubuntu -c "git config --global user.name 'Jam' && git config --global user.email 'jam@letsjam.now'`,
    );
    expect(script).not.toContain("\ngit config user.name ");
    expect(script).not.toContain("\ngit config user.email ");
  });

  test("encodes the script as base64 for EC2 user data", () => {
    const encoded = buildJamInstanceUserData();
    const decoded = Buffer.from(encoded, "base64").toString("utf8");

    expect(decoded).toBe(buildJamInstanceUserDataScript());
  });
});

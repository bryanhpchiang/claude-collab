export type VersionInfo = {
  version: string;
  commit: string;
  buildTime: string;
};

const info: VersionInfo = (() => {
  let commit = "unknown";
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
    const out = result.stdout.toString().trim();
    if (result.exitCode === 0 && out) commit = out;
  } catch {}

  return {
    version: "1.0.0",
    commit,
    buildTime: new Date().toISOString(),
  };
})();

export function getVersionInfo(): VersionInfo {
  return info;
}

import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const runtimeRoot = join(import.meta.dir, "..");
const webDistDir = join(runtimeRoot, "dist", "web");
const webAssetsDir = join(webDistDir, "assets");
const webManifestDir = join(webDistDir, ".vite");
const webManifestPath = join(webManifestDir, "manifest.json");
const webEntry = join(runtimeRoot, "src", "web", "main.client.tsx");
const webEntryName = "src/web/main.client.tsx";

function toManifestPath(pathname: string) {
  return relative(webDistDir, pathname).replaceAll("\\", "/");
}

await rm(webDistDir, { recursive: true, force: true });
await mkdir(webAssetsDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [webEntry],
  outdir: webAssetsDir,
  format: "esm",
  target: "browser",
  splitting: true,
  minify: true,
  sourcemap: "none",
});

if (!result.success) {
  const details = result.logs
    .map((log) => `${log.level}: ${log.message}`)
    .join("\n");
  throw new Error(`Failed to build runtime web assets\n${details}`);
}

await mkdir(webManifestDir, { recursive: true });

const entryOutput = result.outputs.find((output) => output.kind === "entry-point");
if (!entryOutput) {
  throw new Error("Missing runtime web entry output");
}

const cssOutputs = result.outputs.filter((output) => output.path.endsWith(".css"));

const manifest = {
  [webEntryName]: {
    file: toManifestPath(join(webAssetsDir, basename(entryOutput.path))),
    src: webEntryName,
    isEntry: true,
    ...(cssOutputs.length
      ? {
          css: cssOutputs.map((output) =>
            toManifestPath(join(webAssetsDir, basename(output.path))),
          ),
        }
      : {}),
  },
};

await writeFile(webManifestPath, JSON.stringify(manifest, null, 2));

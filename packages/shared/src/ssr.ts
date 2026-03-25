export type ViteManifestEntry = {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
};

export type ViteManifest = Record<string, ViteManifestEntry>;

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBootstrapScript(id: string, data: unknown) {
  return `<script id="${escapeHtml(id)}" type="application/json">${escapeHtml(JSON.stringify(data))}</script>`;
}

export function readBootstrapData<T>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing bootstrap payload: ${id}`);

  const source = element.textContent || "";
  return JSON.parse(source) as T;
}

export function resolveViteEntryAssets(manifest: ViteManifest, entryName: string) {
  const entry = manifest[entryName];
  if (!entry?.file) return null;

  const styles: string[] = [];
  const visited = new Set<string>();

  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);

    const next = manifest[name];
    if (!next) return;

    for (const imported of next.imports || []) visit(imported);
    for (const imported of next.dynamicImports || []) visit(imported);
    for (const css of next.css || []) {
      if (!styles.includes(css)) styles.push(css);
    }
  };

  visit(entryName);

  return {
    script: entry.file,
    styles,
  };
}

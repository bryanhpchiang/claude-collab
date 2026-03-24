type LayoutOptions = {
  title: string;
  description?: string;
  bodyClass?: string;
  head?: string;
  content: string;
  scripts?: string[];
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function serializeForScript(data: unknown) {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

export function renderLayout(options: LayoutOptions) {
  const description =
    options.description ||
    "Jam coordination server for launching and managing collaborative Claude Code instances.";
  const scripts = (options.scripts || [])
    .map((src) => `<script type="module" src="${escapeHtml(src)}"></script>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/static/app.css">
    ${options.head || ""}
  </head>
  <body class="${escapeHtml(options.bodyClass || "")}">
    ${options.content}
    ${scripts}
  </body>
</html>`;
}

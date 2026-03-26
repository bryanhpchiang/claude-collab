import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { renderBootstrapScript, renderOgMetaTags } from "shared";
import type { AuthenticatedRuntimeUser } from "./runtime-auth";
import { RuntimeApp } from "../web/RuntimeApp";
import { RUNTIME_BOOTSTRAP_ID } from "../web/bootstrap";
import { getRuntimeWebAssets } from "./web-assets";
import { JAM_NAME } from "../config";

export async function renderRuntimeApp(
  initialUser: AuthenticatedRuntimeUser | null,
  requestedSessionId?: string,
) {
  const assets = await getRuntimeWebAssets();
  const jamName = JAM_NAME || null;
  const bootstrap = {
    initialUser,
    jamName,
    requestedSessionId: requestedSessionId || null,
  };
  const appHtml = renderToString(createElement(RuntimeApp, { bootstrap }));
  const styleTags = assets.styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const scriptTags = assets.scripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${jamName ? `${jamName} — Jam` : "Jam — Multiplayer Claude"}</title>
  ${renderOgMetaTags()}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='20' y1='8' x2='44' y2='18' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E8A838'/%3E%3Cstop offset='1' stop-color='%23D4872C'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='20' y='8' width='24' height='6' rx='3' fill='url(%23g)'/%3E%3Cpath d='M18 14h28v3c0 1-3 3-6 3H24c-3 0-6-2-6-3v-3z' fill='url(%23g)' opacity='0.8'/%3E%3Cpath d='M16 20c-2 0-4 2-4 4v20c0 8 6 14 14 14h12c8 0 14-6 14-14V24c0-2-2-4-4-4H16z' fill='%231E1832'/%3E%3Cpath d='M12 38c2-2 8-4 14-3s11 3 14 2 9-3 14-2v10c0 8-6 14-14 14H26c-8 0-14-6-14-14V38z' fill='%23A855F7' opacity='0.55'/%3E%3Cpath d='M44 52 C44 50 45.5 48.5 48 48.5 C50.5 48.5 52 50 52 52 C52 53 51 53.5 48 53.5 C45 53.5 44 53 44 52Z' fill='%236D4BA0'/%3E%3Ccircle cx='11' cy='53' r='2' fill='%23A855F7' opacity='0.45'/%3E%3Ccircle cx='55' cy='53.5' r='1.5' fill='%237C3AED' opacity='0.4'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${styleTags}
</head>
<body class="in-lobby">
  <div id="app">${appHtml}</div>
  ${renderBootstrapScript(RUNTIME_BOOTSTRAP_ID, bootstrap)}
  ${scriptTags}
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

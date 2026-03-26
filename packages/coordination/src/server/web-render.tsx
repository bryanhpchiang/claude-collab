import { renderToString } from "react-dom/server";
import { renderBootstrapScript, renderOgMetaTags } from "shared";
import type { CoordinationConfig } from "../config";
import { COORDINATION_BOOTSTRAP_ID } from "../web/bootstrap";
import { DashboardPage } from "../web/pages/DashboardPage";
import { ForbiddenPage } from "../web/pages/ForbiddenPage";
import { LandingPage } from "../web/pages/LandingPage";
import type { CoordinationBootstrap } from "../web/types";
import { getCoordinationWebAssets } from "./web-assets";

type RenderPageOptions = {
  bootstrap: CoordinationBootstrap;
};

export async function renderCoordinationPage(
  config: CoordinationConfig,
  options: RenderPageOptions,
) {
  const page = options.bootstrap.page;
  const assets = await getCoordinationWebAssets(config, page);
  const appHtml = page === "dashboard"
    ? renderToString(<DashboardPage initialJams={options.bootstrap.jams} user={options.bootstrap.user} />)
    : renderToString(
      <LandingPage authEnabled={options.bootstrap.authEnabled} signedIn={options.bootstrap.signedIn} />,
    );
  const pageTitle = page === "dashboard" ? "Jam Dashboard" : "Jam";
  const bodyClass = page === "dashboard" ? "page-dashboard" : "page-landing";

  const styleTags = assets.styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const scriptTags = assets.scripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${pageTitle}</title>
    <meta name="description" content="Code together with Claude">
    ${renderOgMetaTags()}
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230C0A14'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='19' y1='11' x2='45' y2='20' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E8A838'/%3E%3Cstop offset='1' stop-color='%23D4872C'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='16' y1='20' x2='48' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='rgba(232,168,56,0.12)'/%3E%3Cstop offset='1' stop-color='rgba(168,85,247,0.06)'/%3E%3C/linearGradient%3E%3ClinearGradient id='f' x1='18' y1='34' x2='46' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23A855F7' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%237C3AED' stop-opacity='0.15'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='20' y='11' width='24' height='5' rx='2.5' fill='url(%23g)'/%3E%3Crect x='17' y='16' width='30' height='4' rx='2' fill='url(%23g)' opacity='0.7'/%3E%3Cpath d='M19 20c-1 0-3 1-3 3v22c0 5 4 9 9 9h14c5 0 9-4 9-9V23c0-2-2-3-3-3H19z' fill='url(%23b)'/%3E%3Cpath d='M19 36c0 0 5-4 13-4s13 4 13 4v9c0 5-4 9-9 9H28c-5 0-9-4-9-9V36z' fill='url(%23f)' opacity='0.6'/%3E%3Cpath d='M23 25v12' stroke='rgba(255,255,255,0.08)' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700&display=swap" rel="stylesheet">
    ${styleTags}
  </head>
  <body class="${bodyClass}">
    <div id="app">${appHtml}</div>
    ${renderBootstrapScript(COORDINATION_BOOTSTRAP_ID, options.bootstrap)}
    ${scriptTags}
  </body>
</html>`;
}

export async function renderForbiddenPage(config: CoordinationConfig) {
  const assets = await getCoordinationWebAssets(config, "landing");
  const styleTags = assets.styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const bodyHtml = renderToString(<ForbiddenPage />);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Access Denied — Jam</title>
    ${renderOgMetaTags()}
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230C0A14'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='19' y1='11' x2='45' y2='20' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E8A838'/%3E%3Cstop offset='1' stop-color='%23D4872C'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='16' y1='20' x2='48' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='rgba(232,168,56,0.12)'/%3E%3Cstop offset='1' stop-color='rgba(168,85,247,0.06)'/%3E%3C/linearGradient%3E%3ClinearGradient id='f' x1='18' y1='34' x2='46' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23A855F7' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%237C3AED' stop-opacity='0.15'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='20' y='11' width='24' height='5' rx='2.5' fill='url(%23g)'/%3E%3Crect x='17' y='16' width='30' height='4' rx='2' fill='url(%23g)' opacity='0.7'/%3E%3Cpath d='M19 20c-1 0-3 1-3 3v22c0 5 4 9 9 9h14c5 0 9-4 9-9V23c0-2-2-3-3-3H19z' fill='url(%23b)'/%3E%3Cpath d='M19 36c0 0 5-4 13-4s13 4 13 4v9c0 5-4 9-9 9H28c-5 0-9-4-9-9V36z' fill='url(%23f)' opacity='0.6'/%3E%3Cpath d='M23 25v12' stroke='rgba(255,255,255,0.08)' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    ${styleTags}
  </head>
  ${bodyHtml}
</html>`;
}

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
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230C0A14'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='16' y1='12' x2='48' y2='52' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E8A838'/%3E%3Cstop offset='1' stop-color='%23D4872C'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='16' y1='26' x2='48' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='rgba(232,168,56,0.22)'/%3E%3Cstop offset='1' stop-color='rgba(212,135,44,0.08)'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M18 13h28c1 0 2 1 2 2v3H16v-3c0-1 1-2 2-2z' fill='url(%23g)'/%3E%3Cpath d='M16 18h32v3c0 1-3 3-6 3H22c-3 0-6-2-6-3v-3z' fill='url(%23g)' opacity='0.7'/%3E%3Cpath d='M22 26h20c3 0 6 2 7 5l2 16c1 3-2 6-5 6H18c-3 0-6-3-5-6l2-16c1-3 4-5 7-5z' fill='url(%23b)'/%3E%3Cpath d='M25 32c3 5 8 9 11 12 3-3 8-7 11-12' stroke='rgba(255,255,255,0.12)' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E">
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
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230C0A14'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='16' y1='12' x2='48' y2='52' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E8A838'/%3E%3Cstop offset='1' stop-color='%23D4872C'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='16' y1='26' x2='48' y2='54' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='rgba(232,168,56,0.22)'/%3E%3Cstop offset='1' stop-color='rgba(212,135,44,0.08)'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M18 13h28c1 0 2 1 2 2v3H16v-3c0-1 1-2 2-2z' fill='url(%23g)'/%3E%3Cpath d='M16 18h32v3c0 1-3 3-6 3H22c-3 0-6-2-6-3v-3z' fill='url(%23g)' opacity='0.7'/%3E%3Cpath d='M22 26h20c3 0 6 2 7 5l2 16c1 3-2 6-5 6H18c-3 0-6-3-5-6l2-16c1-3 4-5 7-5z' fill='url(%23b)'/%3E%3Cpath d='M25 32c3 5 8 9 11 12 3-3 8-7 11-12' stroke='rgba(255,255,255,0.12)' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    ${styleTags}
  </head>
  ${bodyHtml}
</html>`;
}

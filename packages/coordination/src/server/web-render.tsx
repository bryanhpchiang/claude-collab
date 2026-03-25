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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    ${styleTags}
  </head>
  ${bodyHtml}
</html>`;
}

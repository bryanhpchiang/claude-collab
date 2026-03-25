/** Open Graph meta tags and image for Jam link previews. */

export const OG_TITLE = "Jam — Multiplayer Claude";
export const OG_DESCRIPTION = "Code together with Claude";
export const OG_SITE_NAME = "Jam";
export const OG_SITE_URL = "https://letsjam.now";
export const OG_IMAGE_PATH = "/og-image.svg";

/** OG meta tags HTML snippet for injection into <head>. */
export function renderOgMetaTags(url?: string) {
  const pageUrl = url || OG_SITE_URL;
  const imageUrl = `${pageUrl.replace(/\/$/, "")}${OG_IMAGE_PATH}`;
  return `
    <meta property="og:title" content="${OG_TITLE}">
    <meta property="og:description" content="${OG_DESCRIPTION}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${OG_SITE_NAME}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${OG_TITLE}">
    <meta name="twitter:description" content="${OG_DESCRIPTION}">
    <meta name="twitter:image" content="${imageUrl}">`;
}

/** 1200x630 SVG OG image with Jam branding. */
export const OG_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff9a56"/>
      <stop offset="100%" stop-color="#ff6b6b"/>
    </linearGradient>
    <linearGradient id="brandText" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff9a56"/>
      <stop offset="100%" stop-color="#ff6b6b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0d1117"/>
  <!-- Jar icon -->
  <g transform="translate(600,240) scale(3)">
    <rect x="-12" y="-18" width="24" height="28" rx="4" fill="none" stroke="url(#brand)" stroke-width="2.5"/>
    <rect x="-14" y="-20" width="28" height="8" rx="3" fill="url(#brand)" opacity="0.9"/>
    <circle cx="-4" cy="0" r="2.5" fill="#ff9a56" opacity="0.8"/>
    <circle cx="4" cy="4" r="2" fill="#ffcc80" opacity="0.7"/>
    <circle cx="-2" cy="6" r="1.5" fill="#ff6b6b" opacity="0.6"/>
  </g>
  <!-- Title -->
  <text x="600" y="380" text-anchor="middle" font-family="Fredoka, Nunito, -apple-system, sans-serif" font-weight="700" font-size="72" fill="url(#brandText)">Jam</text>
  <!-- Subtitle -->
  <text x="600" y="440" text-anchor="middle" font-family="Fredoka, Nunito, -apple-system, sans-serif" font-weight="600" font-size="32" fill="#8b949e">Multiplayer Claude</text>
  <!-- Tagline -->
  <text x="600" y="500" text-anchor="middle" font-family="Inter, -apple-system, sans-serif" font-weight="400" font-size="24" fill="#6e7681">Code together with Claude</text>
</svg>`;

/** Serve the OG image SVG as an HTTP response. */
export function serveOgImage(): Response {
  return new Response(OG_IMAGE_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

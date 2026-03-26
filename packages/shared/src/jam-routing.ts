export const JAM_SHARED_SECRET_HEADER = "x-jam-shared-secret";
export const E2B_TRAFFIC_ACCESS_TOKEN_HEADER = "e2b-traffic-access-token";

export function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function buildJamPublicHost(jamId: string, jamHostSuffix: string) {
  return `${jamId}.${normalizeHostname(jamHostSuffix)}`;
}

export function buildPreviewPublicHost(
  previewId: string,
  previewHostSuffix: string,
) {
  return `${previewId}.${normalizeHostname(previewHostSuffix)}`;
}

export function buildE2bPublicHost(
  targetId: string,
  port: number,
  domain: string,
) {
  return `${port}-${targetId}.${normalizeHostname(domain)}`;
}

export function matchHostedId(hostname: string, suffix: string) {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedSuffix = normalizeHostname(suffix);
  if (!normalizedHost || !normalizedSuffix) return undefined;

  const prefix = `.${normalizedSuffix}`;
  if (!normalizedHost.endsWith(prefix)) return undefined;

  const id = normalizedHost.slice(0, -prefix.length);
  if (!id || id.includes(".")) return undefined;
  return id;
}

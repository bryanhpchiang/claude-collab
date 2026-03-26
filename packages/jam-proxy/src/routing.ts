import {
  E2B_TRAFFIC_ACCESS_TOKEN_HEADER,
  buildE2bPublicHost,
  matchHostedId,
  normalizeHostname,
} from "shared";
import type { JamProxyConfig } from "./config";
import type { JamRouteLookup, JamRouteRecord } from "./db";

export type ProxyUpstreamTarget = {
  target: string;
  headers?: Record<string, string>;
};

export function buildUpstreamTarget(
  route: JamRouteRecord,
  config: JamProxyConfig,
): ProxyUpstreamTarget | undefined {
  if (route.provider === "e2b") {
    return {
      target: `https://${buildE2bPublicHost(
        route.targetId,
        route.port,
        config.e2bDomain,
      )}`,
      headers: route.trafficAccessToken
        ? { [E2B_TRAFFIC_ACCESS_TOKEN_HEADER]: route.trafficAccessToken }
        : undefined,
    };
  }

  if (!route.ip) return undefined;

  return {
    target: `http://${route.ip}:${route.port}`,
  };
}

export async function resolveRequestTarget(
  host: string,
  config: JamProxyConfig,
  lookup: JamRouteLookup,
) {
  const normalizedHost = normalizeHostname(host);
  const jamId = matchHostedId(normalizedHost, config.jamHostSuffix);
  if (jamId) {
    const route = await lookup.getJamRoute(jamId);
    return route ? buildUpstreamTarget(route, config) : undefined;
  }

  if (!matchHostedId(normalizedHost, config.jamPreviewHostSuffix)) {
    return undefined;
  }

  const previewRoute = await lookup.getPreviewRoute(normalizedHost);
  return previewRoute ? buildUpstreamTarget(previewRoute, config) : undefined;
}

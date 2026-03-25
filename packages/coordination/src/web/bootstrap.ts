import { readBootstrapData } from "shared";
import type { CoordinationPage, DashboardBootstrap, LandingBootstrap } from "./types";

export const COORDINATION_BOOTSTRAP_ID = "jam-coordination-bootstrap";
export const COORDINATION_WEB_CLIENT_ENTRIES: Record<CoordinationPage, string> = {
  landing: "src/web/landing.client.tsx",
  dashboard: "src/web/dashboard.client.tsx",
};

export function readLandingBootstrap() {
  const bootstrap = readBootstrapData<LandingBootstrap>(COORDINATION_BOOTSTRAP_ID);
  if (bootstrap.page !== "landing") {
    throw new Error(`Expected landing bootstrap payload, received ${bootstrap.page}`);
  }
  return bootstrap;
}

export function readDashboardBootstrap() {
  const bootstrap = readBootstrapData<DashboardBootstrap>(COORDINATION_BOOTSTRAP_ID);
  if (bootstrap.page !== "dashboard") {
    throw new Error(`Expected dashboard bootstrap payload, received ${bootstrap.page}`);
  }
  return bootstrap;
}

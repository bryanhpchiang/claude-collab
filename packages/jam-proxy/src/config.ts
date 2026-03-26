export type JamProxyConfig = {
  port: number;
  serviceName: string;
  databaseUrl: string;
  databaseSslCaPath: string;
  jamHostSuffix: string;
  jamPreviewHostSuffix: string;
  jamRuntimePort: number;
  e2bDomain: string;
};

export function loadConfig(): JamProxyConfig {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the jam proxy");
  }

  const port = process.env.PORT === undefined ? 8090 : Number(process.env.PORT);
  const jamRuntimePort =
    process.env.JAM_RUNTIME_PORT === undefined
      ? 7681
      : Number(process.env.JAM_RUNTIME_PORT);

  return {
    port: Number.isFinite(port) ? port : 8090,
    serviceName: "jam-proxy",
    databaseUrl,
    databaseSslCaPath:
      process.env.DATABASE_SSL_CA_PATH ||
      process.env.PGSSLROOTCERT ||
      "/etc/ssl/certs/rds-global-bundle.pem",
    jamHostSuffix: process.env.JAM_HOST_SUFFIX || "jams.letsjam.now",
    jamPreviewHostSuffix:
      process.env.JAM_PREVIEW_HOST_SUFFIX || "previews.letsjam.now",
    jamRuntimePort: Number.isFinite(jamRuntimePort) ? jamRuntimePort : 7681,
    e2bDomain: process.env.E2B_DOMAIN || "e2b.letsjam.now",
  };
}

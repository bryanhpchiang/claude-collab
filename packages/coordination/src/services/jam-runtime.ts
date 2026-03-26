import type { CoordinationConfig } from "../config";

export type JamLaunchConfig = {
  jamId: string;
  jamName?: string;
  sharedSecret: string;
  deploySecret: string;
};

export type JamRuntimeEnv = JamLaunchConfig & {
  publicHost: string;
};

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildJamRuntimeEnvVars(
  config: CoordinationConfig,
  runtimeEnv: JamRuntimeEnv,
) {
  return {
    JAM_ID: runtimeEnv.jamId,
    ...(runtimeEnv.jamName ? { JAM_NAME: runtimeEnv.jamName } : {}),
    JAM_PUBLIC_HOST: runtimeEnv.publicHost,
    JAM_SHARED_SECRET: runtimeEnv.sharedSecret,
    JAM_DEPLOY_SECRET: runtimeEnv.deploySecret,
    COORDINATION_BASE_URL: config.baseUrl,
    ...(config.anthropicApiKey
      ? { ANTHROPIC_API_KEY: config.anthropicApiKey }
      : {}),
  };
}

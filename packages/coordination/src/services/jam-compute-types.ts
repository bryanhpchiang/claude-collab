import type { JamLaunchConfig } from "./jam-runtime";

export type JamComputeProvider = "ec2" | "e2b";
export type JamRuntimeStatus = "pending" | "running" | "terminated";

export type JamEnvironmentHandle = {
  provider: JamComputeProvider;
  targetId: string;
  ip?: string;
  publicHost?: string;
  trafficAccessToken?: string;
  targetGroupArn?: string;
  listenerRuleArn?: string;
};

export type LaunchJamEnvironmentResult = JamEnvironmentHandle & {
  publicHost: string;
};

export type JamComputeClient = {
  provider: JamComputeProvider;
  launchJamEnvironment(
    jamId: string,
    launchConfig: JamLaunchConfig,
  ): Promise<LaunchJamEnvironmentResult>;
  destroyJamEnvironment(handle: JamEnvironmentHandle): Promise<void>;
  getRuntimeStatus(handle: JamEnvironmentHandle): Promise<JamRuntimeStatus>;
};

export function buildJamPath(jamId: string) {
  return `/j/${jamId}`;
}

export function buildJamRedirectUrl(
  publicHost: string,
  requestUrl: string,
  pathname = "/",
) {
  const target = new URL(`https://${publicHost}${pathname}`);
  const source = new URL(requestUrl);
  target.search = source.search;
  return target.toString();
}

export function buildJamDeployUrl(publicHost: string) {
  return `https://${publicHost}/api/deploy`;
}

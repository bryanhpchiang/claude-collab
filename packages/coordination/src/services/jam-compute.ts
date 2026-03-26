import type { CoordinationConfig } from "../config";
import { createE2bComputeClient } from "./e2b";
import { createEc2ComputeClient } from "./ec2";
import {
  buildJamDeployUrl,
  type JamComputeClient,
  type JamComputeProvider,
} from "./jam-compute-types";

export function createJamComputeService(config: CoordinationConfig) {
  const clients = new Map<JamComputeProvider, JamComputeClient>([
    ["ec2", createEc2ComputeClient(config)],
  ]);

  if (config.e2bApiKey) {
    clients.set("e2b", createE2bComputeClient(config));
  }

  function getClient(provider: JamComputeProvider) {
    const client = clients.get(provider);
    if (!client) {
      throw new Error(`Jam compute provider '${provider}' is not configured`);
    }
    return client;
  }

  return {
    provider: config.jamComputeProvider,

    launchJamEnvironment(
      jamId: string,
      launchConfig: Parameters<JamComputeClient["launchJamEnvironment"]>[1],
    ) {
      return getClient(config.jamComputeProvider).launchJamEnvironment(
        jamId,
        launchConfig,
      );
    },

    destroyJamEnvironment(
      handle: Parameters<JamComputeClient["destroyJamEnvironment"]>[0],
    ) {
      return getClient(handle.provider).destroyJamEnvironment(handle);
    },

    getRuntimeStatus(
      handle: Parameters<JamComputeClient["getRuntimeStatus"]>[0],
    ) {
      return getClient(handle.provider).getRuntimeStatus(handle);
    },

    buildDeployUrl(publicHost: string) {
      return buildJamDeployUrl(publicHost);
    },
  };
}

export type JamComputeService = ReturnType<typeof createJamComputeService>;

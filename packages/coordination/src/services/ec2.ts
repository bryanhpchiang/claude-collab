import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type Instance,
} from "@aws-sdk/client-ec2";
import type { CoordinationConfig } from "../config";

type InstanceLike = {
  PublicIpAddress?: string | null;
};

type WaitForPublicIpOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

function isRetryableInstanceLookupError(error: unknown) {
  const name =
    typeof error === "object" && error && "name" in error
      ? String(error.name)
      : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";

  return name === "InvalidInstanceID.NotFound" || message.includes("does not exist");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPublicIp(
  loadInstance: () => Promise<InstanceLike | undefined>,
  options: WaitForPublicIpOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? 20;
  const delayMs = options.delayMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const instance = await loadInstance();
      if (instance?.PublicIpAddress) {
        return instance.PublicIpAddress;
      }
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts - 1;
      if (!isRetryableInstanceLookupError(error) || isLastAttempt) {
        throw error;
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error("Timed out waiting for public IP");
}

export function buildJamPath(jamId: string) {
  return `/j/${jamId}`;
}

export function buildJamRedirectUrl(
  ip: string,
  requestUrl: string,
  runtimePort = 7681,
) {
  const target = new URL(`http://${ip}:${runtimePort}/`);
  const source = new URL(requestUrl);
  target.search = source.search;
  return target.toString();
}

export function createEc2Service(config: CoordinationConfig) {
  const ec2 = new EC2Client({ region: config.awsRegion });

  async function getInstance(instanceId: string): Promise<Instance | undefined> {
    const result = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    return result.Reservations?.[0]?.Instances?.[0];
  }

  return {
    async launchJamInstance(jamId: string, userData: string) {
      const result = await ec2.send(
        new RunInstancesCommand({
          ImageId: config.jamAmiId,
          InstanceType: config.jamInstanceType,
          MinCount: 1,
          MaxCount: 1,
          SecurityGroupIds: [config.jamSecurityGroupId],
          UserData: userData,
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [{ Key: "Name", Value: `${config.jamTagPrefix}${jamId}` }],
            },
          ],
        }),
      );

      const instanceId = result.Instances?.[0]?.InstanceId;
      if (!instanceId) {
        throw new Error("Failed to launch instance");
      }
      return instanceId;
    },

    async terminateInstance(instanceId: string) {
      await ec2.send(
        new TerminateInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );
    },

    getInstance,

    async resolvePublicIp(instanceId: string) {
      return (await getInstance(instanceId))?.PublicIpAddress || undefined;
    },

    async probeRuntime(ip: string) {
      try {
        const response = await fetch(`http://${ip}:${config.jamRuntimePort}/`, {
          signal: AbortSignal.timeout(3000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    buildJamPath,

    buildJamRedirectUrl(ip: string, requestUrl: string) {
      return buildJamRedirectUrl(ip, requestUrl, config.jamRuntimePort);
    },
  };
}

export type Ec2Service = ReturnType<typeof createEc2Service>;

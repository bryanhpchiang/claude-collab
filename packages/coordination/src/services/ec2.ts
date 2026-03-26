import {
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DescribeRulesCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type Instance,
} from "@aws-sdk/client-ec2";
import type { CoordinationConfig } from "../config";
import { buildJamPublicHost } from "shared";
import {
  buildJamPath,
  buildJamRedirectUrl,
  type JamComputeClient,
  type JamEnvironmentHandle,
  type JamRuntimeStatus,
} from "./jam-compute-types";
import { type JamRuntimeEnv } from "./jam-runtime";
import { buildJamInstanceUserData } from "./user-data";

type InstanceLike = {
  PublicIpAddress?: string | null;
};

type InstanceStateLike = {
  State?: {
    Name?: string | null;
  } | null;
};

type WaitForPublicIpOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

type JamTarget = {
  listenerRuleArn: string;
  publicHost: string;
  targetGroupArn: string;
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

  return (
    name === "InvalidInstanceID.NotFound" || message.includes("does not exist")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeTargetGroupName(name: string) {
  return name.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 32) || "jam-target";
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

export async function waitForInstanceRunning(
  loadInstance: () => Promise<InstanceStateLike | undefined>,
  options: WaitForPublicIpOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? 20;
  const delayMs = options.delayMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const instance = await loadInstance();
      const state = instance?.State?.Name;

      if (state === "running") {
        return;
      }

      if (state && state !== "pending") {
        throw new Error(
          `Instance entered '${state}' before reaching 'running'`,
        );
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

  throw new Error("Timed out waiting for instance to enter running state");
}

export { buildJamPath, buildJamRedirectUrl };

export function createEc2ComputeClient(
  config: CoordinationConfig,
): JamComputeClient {
  const ec2 = new EC2Client({ region: config.awsRegion });
  const elbv2 = new ElasticLoadBalancingV2Client({ region: config.awsRegion });

  async function getInstance(
    instanceId: string,
  ): Promise<Instance | undefined> {
    const result = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    return result.Reservations?.[0]?.Instances?.[0];
  }

  async function nextListenerPriority() {
    if (!config.jamAlbListenerArn) {
      throw new Error("JAM_ALB_LISTENER_ARN is required to manage jam routing");
    }

    const response = await elbv2.send(
      new DescribeRulesCommand({ ListenerArn: config.jamAlbListenerArn }),
    );
    const taken = new Set(
      (response.Rules || [])
        .map((rule) => Number(rule.Priority))
        .filter((priority) => Number.isInteger(priority) && priority > 0),
    );

    for (let priority = 1000; priority < 50000; priority += 1) {
      if (!taken.has(priority)) return priority;
    }

    throw new Error("No ALB listener priorities available for jam routing");
  }

  async function launchJamInstance(jamId: string, userData: string) {
    const result = await ec2.send(
      new RunInstancesCommand({
        ImageId: config.jamAmiId,
        InstanceType: config.jamInstanceType as any,
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
  }

  async function attachJamTarget(
    jamId: string,
    instanceId: string,
  ): Promise<JamTarget> {
    if (!config.jamAlbListenerArn) {
      throw new Error("JAM_ALB_LISTENER_ARN is required to manage jam routing");
    }

    if (!config.jamVpcId) {
      throw new Error("JAM_VPC_ID is required to manage jam routing");
    }

    const publicHost = buildJamPublicHost(jamId, config.jamHostSuffix);
    const targetGroupResponse = await elbv2.send(
      new CreateTargetGroupCommand({
        Name: sanitizeTargetGroupName(`${config.jamTagPrefix}${jamId}`),
        Port: config.jamRuntimePort,
        Protocol: "HTTP",
        VpcId: config.jamVpcId,
        TargetType: "instance",
        HealthCheckEnabled: true,
        HealthCheckPath: "/health",
        HealthCheckProtocol: "HTTP",
        Matcher: { HttpCode: "200" },
      }),
    );
    const targetGroupArn =
      targetGroupResponse.TargetGroups?.[0]?.TargetGroupArn;
    if (!targetGroupArn) {
      throw new Error("Failed to create ALB target group");
    }

    try {
      await waitForInstanceRunning(() => getInstance(instanceId));

      await elbv2.send(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [{ Id: instanceId, Port: config.jamRuntimePort }],
        }),
      );

      const priority = await nextListenerPriority();
      const ruleResponse = await elbv2.send(
        new CreateRuleCommand({
          ListenerArn: config.jamAlbListenerArn,
          Priority: priority,
          Conditions: [
            {
              Field: "host-header",
              HostHeaderConfig: { Values: [publicHost] },
            },
          ],
          Actions: [
            {
              Type: "forward",
              TargetGroupArn: targetGroupArn,
            },
          ],
        }),
      );
      const listenerRuleArn = ruleResponse.Rules?.[0]?.RuleArn;
      if (!listenerRuleArn) {
        throw new Error("Failed to create ALB listener rule");
      }

      return {
        publicHost,
        targetGroupArn,
        listenerRuleArn,
      };
    } catch (error) {
      await elbv2
        .send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }))
        .catch(() => undefined);
      throw error;
    }
  }

  async function removeJamTarget(
    listenerRuleArn?: string,
    targetGroupArn?: string,
  ) {
    if (listenerRuleArn) {
      await elbv2
        .send(new DeleteRuleCommand({ RuleArn: listenerRuleArn }))
        .catch((error) =>
          console.error(
            "[alb] failed to delete listener rule",
            listenerRuleArn,
            error,
          ),
        );
    }

    if (targetGroupArn) {
      await elbv2
        .send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }))
        .catch((error) =>
          console.error(
            "[alb] failed to delete target group",
            targetGroupArn,
            error,
          ),
        );
    }
  }

  async function terminateInstance(instanceId: string) {
    await ec2.send(
      new TerminateInstancesCommand({
        InstanceIds: [instanceId],
      }),
    );
  }

  async function probeRuntime(targetGroupArn: string) {
    try {
      const response = await elbv2.send(
        new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
      );
      return (response.TargetHealthDescriptions || []).some(
        (entry) => entry.TargetHealth?.State === "healthy",
      );
    } catch {
      return false;
    }
  }

  async function getRuntimeStatus(
    handle: JamEnvironmentHandle,
  ): Promise<JamRuntimeStatus> {
    try {
      const instance = await getInstance(handle.targetId);
      const ip = instance?.PublicIpAddress || undefined;
      if (ip) {
        handle.ip = ip;
      }
      const state = instance?.State?.Name;
      if (!state || state === "terminated" || state === "shutting-down") {
        return "terminated";
      }

      if (state !== "running") {
        return "pending";
      }

      if (!handle.targetGroupArn) {
        return "pending";
      }

      return (await probeRuntime(handle.targetGroupArn))
        ? "running"
        : "pending";
    } catch (error) {
      if (isRetryableInstanceLookupError(error)) {
        return "terminated";
      }
      throw error;
    }
  }

  return {
    provider: "ec2",

    async launchJamEnvironment(jamId, launchConfig) {
      const runtimeEnv: JamRuntimeEnv = {
        ...launchConfig,
        publicHost: buildJamPublicHost(jamId, config.jamHostSuffix),
      };
      const targetId = await launchJamInstance(
        jamId,
        buildJamInstanceUserData(config, runtimeEnv),
      );
      const target = await attachJamTarget(jamId, targetId);
      const ip = await waitForPublicIp(() => getInstance(targetId));

      return {
        provider: "ec2",
        targetId,
        ip,
        publicHost: target.publicHost,
        targetGroupArn: target.targetGroupArn,
        listenerRuleArn: target.listenerRuleArn,
      };
    },

    async destroyJamEnvironment(handle) {
      await removeJamTarget(handle.listenerRuleArn, handle.targetGroupArn);
      await terminateInstance(handle.targetId);
    },

    getRuntimeStatus,
  };
}

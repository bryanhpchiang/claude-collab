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

type InstanceLike = {
  PublicIpAddress?: string | null;
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

  return name === "InvalidInstanceID.NotFound" || message.includes("does not exist");
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

export function buildJamPath(jamId: string) {
  return `/j/${jamId}`;
}

export function buildJamHost(jamId: string, jamHostSuffix: string) {
  return `${jamId}.${jamHostSuffix}`;
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

export function createEc2Service(config: CoordinationConfig) {
  const ec2 = new EC2Client({ region: config.awsRegion });
  const elbv2 = new ElasticLoadBalancingV2Client({ region: config.awsRegion });

  async function getInstance(instanceId: string): Promise<Instance | undefined> {
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

    async attachJamTarget(jamId: string, instanceId: string): Promise<JamTarget> {
      if (!config.jamAlbListenerArn) {
        throw new Error("JAM_ALB_LISTENER_ARN is required to manage jam routing");
      }

      if (!config.jamVpcId) {
        throw new Error("JAM_VPC_ID is required to manage jam routing");
      }

      const publicHost = buildJamHost(jamId, config.jamHostSuffix);
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
      const targetGroupArn = targetGroupResponse.TargetGroups?.[0]?.TargetGroupArn;
      if (!targetGroupArn) {
        throw new Error("Failed to create ALB target group");
      }

      try {
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
    },

    async removeJamTarget(listenerRuleArn?: string, targetGroupArn?: string) {
      if (listenerRuleArn) {
        await elbv2
          .send(new DeleteRuleCommand({ RuleArn: listenerRuleArn }))
          .catch((error) => console.error("[alb] failed to delete listener rule", listenerRuleArn, error));
      }

      if (targetGroupArn) {
        await elbv2
          .send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }))
          .catch((error) => console.error("[alb] failed to delete target group", targetGroupArn, error));
      }
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

    async probeRuntime(targetGroupArn: string) {
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
    },

    buildJamHost(jamId: string) {
      return buildJamHost(jamId, config.jamHostSuffix);
    },

    buildJamPath,

    buildJamRedirectUrl(publicHost: string, requestUrl: string, pathname = "/") {
      return buildJamRedirectUrl(publicHost, requestUrl, pathname);
    },

    buildDeployUrl(publicHost: string) {
      return `https://${publicHost}/api/deploy`;
    },
  };
}

export type Ec2Service = ReturnType<typeof createEc2Service>;

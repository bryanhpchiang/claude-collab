import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ResourceExistsException,
  ResourceNotFoundException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { CoordinationConfig } from "../config";

export type JamSecrets = {
  sharedSecret: string;
  deploySecret: string;
};

function buildSecretName(config: CoordinationConfig, jamId: string) {
  return `${config.jamTagPrefix}${jamId}-runtime-secrets`;
}

function parseJamSecrets(secretString?: string) {
  if (!secretString) {
    throw new Error("Jam secret payload is missing");
  }

  const parsed = JSON.parse(secretString) as Partial<JamSecrets>;
  if (
    !parsed ||
    typeof parsed.sharedSecret !== "string" ||
    typeof parsed.deploySecret !== "string"
  ) {
    throw new Error("Jam secret payload is invalid");
  }

  return {
    sharedSecret: parsed.sharedSecret,
    deploySecret: parsed.deploySecret,
  };
}

export function createJamSecretsService(config: CoordinationConfig) {
  const secretsManager = new SecretsManagerClient({ region: config.awsRegion });
  const getSecretName = (jamId: string) => buildSecretName(config, jamId);

  async function getSecretArn(secretId: string) {
    const result = await secretsManager.send(
      new DescribeSecretCommand({ SecretId: secretId }),
    );

    if (!result.ARN) {
      throw new Error("Failed to resolve jam secret ARN");
    }

    return result.ARN;
  }

  return {
    async createJamSecrets(jamId: string, secrets: JamSecrets) {
      const secretName = getSecretName(jamId);
      let result;
      try {
        result = await secretsManager.send(
          new CreateSecretCommand({
            Name: secretName,
            Description: `Runtime secrets for jam ${jamId}`,
            SecretString: JSON.stringify(secrets),
          }),
        );
      } catch (error) {
        if (error instanceof ResourceExistsException) {
          return { secretArn: await getSecretArn(secretName) };
        }
        throw error;
      }

      if (!result.ARN) {
        throw new Error("Failed to create jam secrets");
      }

      return { secretArn: result.ARN };
    },

    async getJamSecrets(secretArn: string): Promise<JamSecrets> {
      const result = await secretsManager.send(
        new GetSecretValueCommand({ SecretId: secretArn }),
      );

      return parseJamSecrets(result.SecretString);
    },

    async deleteJamSecrets(secretArn: string) {
      try {
        await secretsManager.send(
          new DeleteSecretCommand({
            SecretId: secretArn,
            ForceDeleteWithoutRecovery: true,
          }),
        );
      } catch (error) {
        if (error instanceof ResourceNotFoundException) return;
        throw error;
      }
    },
  };
}

export type JamSecretsService = ReturnType<typeof createJamSecretsService>;

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CoordinationConfig } from "../config";

export type JamRecord = {
  id: string;
  instance_id: string;
  creator_login: string;
  creator_name: string;
  creator_avatar: string;
  ip?: string;
  state: string;
  created_at: string;
  name?: string;
};

export function createJamRecordsService(config: CoordinationConfig) {
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.awsRegion }),
  );

  return {
    async putJamRecord(item: JamRecord) {
      await ddb.send(
        new PutCommand({
          TableName: config.jamTableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(id)",
        }),
      );
    },

    async getJamRecord(id: string): Promise<JamRecord | undefined> {
      const result = await ddb.send(
        new GetCommand({
          TableName: config.jamTableName,
          Key: { id },
        }),
      );
      return result.Item as JamRecord | undefined;
    },

    async getActiveJamsByCreator(login: string): Promise<JamRecord[]> {
      const [pending, running] = await Promise.all([
        ddb.send(
          new QueryCommand({
            TableName: config.jamTableName,
            IndexName: "creator-index",
            KeyConditionExpression: "creator_login = :login AND #state = :state",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: {
              ":login": login,
              ":state": "pending",
            },
          }),
        ),
        ddb.send(
          new QueryCommand({
            TableName: config.jamTableName,
            IndexName: "creator-index",
            KeyConditionExpression: "creator_login = :login AND #state = :state",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: {
              ":login": login,
              ":state": "running",
            },
          }),
        ),
      ]);

      return [...(pending.Items || []), ...(running.Items || [])] as JamRecord[];
    },

    async updateJamState(id: string, state: string, ip?: string) {
      const values: Record<string, string> = { ":state": state };
      const expression = ip
        ? "SET #state = :state, ip = :ip"
        : "SET #state = :state";

      if (ip) values[":ip"] = ip;

      await ddb.send(
        new UpdateCommand({
          TableName: config.jamTableName,
          Key: { id },
          UpdateExpression: expression,
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: values,
        }),
      );
    },

    async scanActiveJamRecords(): Promise<JamRecord[]> {
      const result = await ddb.send(
        new ScanCommand({
          TableName: config.jamTableName,
          FilterExpression: "#state = :pending OR #state = :running",
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: {
            ":pending": "pending",
            ":running": "running",
          },
        }),
      );

      return (result.Items || []) as JamRecord[];
    },
  };
}

export type JamRecordsService = ReturnType<typeof createJamRecordsService>;

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Monster } from "@ddm/shared";
import { awsRegion, tableName } from "./config.ts";

/**
 * A single, lazily-created DynamoDB document client reused across warm Lambda
 * invocations. The document client marshals plain JS objects to/from DynamoDB
 * attribute values, so we can store the Monster shape directly.
 */
let docClient: DynamoDBDocumentClient | undefined;

function getClient(): DynamoDBDocumentClient {
  if (docClient === undefined) {
    const base = new DynamoDBClient({ region: awsRegion() });
    docClient = DynamoDBDocumentClient.from(base, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return docClient;
}

/**
 * Load a monster by id. Returns null when no item exists for that id.
 * The table uses `id` (the browser-generated UUID) as its partition key.
 */
export async function getMonster(id: string): Promise<Monster | null> {
  const result = await getClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { id },
    }),
  );
  if (result.Item === undefined) {
    return null;
  }
  return result.Item as Monster;
}

/**
 * Persist a monster, overwriting any existing item with the same id.
 * Returns the monster that was written.
 */
export async function putMonster(monster: Monster): Promise<Monster> {
  await getClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: monster,
    }),
  );
  return monster;
}

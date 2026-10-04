/**
 * DynamoDB persistence for monsters.
 *
 * One table, partition key `clientId` (no sort key, no auth: one browser =
 * one monster). Uses the high-level DynamoDBDocumentClient so items are plain
 * JS objects. The table name is read from the TABLE_NAME environment variable.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Monster } from '@digital-monster/shared';

/** Partition key attribute name for the monsters table. */
export const PARTITION_KEY = 'clientId';

/**
 * Lazily-created document client. Created on first use so the module can be
 * imported (and mocked) in tests without constructing a real AWS client eagerly.
 */
let docClient: DynamoDBDocumentClient | undefined;

/** Returns the shared DynamoDBDocumentClient, creating it on first use. */
export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const base = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    docClient = DynamoDBDocumentClient.from(base, {
      marshallOptions: {
        // Drop undefined attributes rather than failing to marshal them.
        removeUndefinedValues: true,
      },
    });
  }
  return docClient;
}

/** Resolves the configured table name or throws if it is not set. */
function tableName(): string {
  const name = process.env.TABLE_NAME;
  if (!name) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return name;
}

/**
 * Fetches a monster by its clientId. Returns `undefined` when no record exists
 * yet (a fresh browser with no saved monster).
 */
export async function getMonster(clientId: string): Promise<Monster | undefined> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { [PARTITION_KEY]: clientId },
    }),
  );
  return result.Item as Monster | undefined;
}

/** Persists (creates or overwrites) a monster record keyed by clientId. */
export async function putMonster(monster: Monster): Promise<Monster> {
  await getDocClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: monster,
    }),
  );
  return monster;
}

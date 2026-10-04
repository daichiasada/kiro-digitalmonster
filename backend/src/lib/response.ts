/**
 * Helpers for building API Gateway (REST / HTTP API proxy) responses.
 *
 * All responses carry permissive CORS headers because the frontend is served
 * from a different origin (CloudFront) than the API (API Gateway).
 */
import type { APIGatewayProxyResult } from 'aws-lambda';

/** CORS headers applied to every response. */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

/** Builds a JSON API Gateway proxy response with CORS headers. */
export function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

/** Convenience helper for error responses: `{ error: message }`. */
export function error(statusCode: number, message: string): APIGatewayProxyResult {
  return json(statusCode, { error: message });
}

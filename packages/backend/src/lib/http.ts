import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { allowedOrigin } from "../config.ts";

/**
 * CORS headers shared by every response.
 *
 * NOTE: CORS is applied in two places — the API Gateway `corsPreflight` layer
 * (see infra) and here per-handler. Both are driven by the same source of
 * truth, the ALLOWED_ORIGIN env var (defaulting to "*"), so they cannot
 * diverge. If you lock down the origin, set ALLOWED_ORIGIN once and it flows
 * to both layers (the CDK stack passes the same value to the HTTP API).
 */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  };
}

/** Build a JSON HTTP API v2 response with CORS headers applied. */
export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
    body: JSON.stringify(body),
  };
}

/** Convenience 200 OK JSON response. */
export function ok(body: unknown): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(200, body);
}

/** Convenience error JSON response ({ error: message }). */
export function error(
  statusCode: number,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(statusCode, { error: message });
}

/**
 * Handle a CORS preflight (OPTIONS) request. Returns a 204 response when the
 * incoming request is an OPTIONS preflight, otherwise null so the caller can
 * continue with its normal logic.
 */
export function handlePreflight(
  method: string | undefined,
): APIGatewayProxyStructuredResultV2 | null {
  if (method !== undefined && method.toUpperCase() === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }
  return null;
}

/** Safely parse a JSON request body, returning null on failure/empty. */
export function parseBody<T>(body: string | undefined, isBase64Encoded?: boolean): T | null {
  if (body === undefined || body === "") {
    return null;
  }
  try {
    const raw = isBase64Encoded ? Buffer.from(body, "base64").toString("utf-8") : body;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

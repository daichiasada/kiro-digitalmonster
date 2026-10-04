/**
 * Runtime + build-time configuration resolution.
 *
 * The API base URL is resolved in this order:
 *   1. a runtime `config.json` fetched from the SITE ROOT, shape:
 *        { "apiBaseUrl": "https://....execute-api.<region>.amazonaws.com" }
 *      This lets the CDK deploy (FEAT-004) write the API URL into the S3
 *      bucket WITHOUT rebuilding the frontend bundle.
 *   2. the build-time env var `VITE_API_BASE_URL` (see .env.example).
 *
 * NOTE for FEAT-004 (CDK): the field name is exactly `apiBaseUrl` and the file
 * must be deployed to the bucket root as `config.json`.
 */

/** Shape of the optional runtime config.json served from the site root. */
export interface RuntimeConfig {
  apiBaseUrl?: string;
}

let cachedBaseUrl: string | null | undefined;

/** The build-time fallback baked into the bundle by Vite. */
function envBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL;
  return typeof value === "string" ? value.trim() : "";
}

/** Strip a single trailing slash so we can safely join paths. */
function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve the API base URL, fetching `/config.json` once and caching it.
 * Falls back to the build-time env var if the file is missing or invalid.
 */
export async function resolveApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl !== undefined) {
    return cachedBaseUrl ?? "";
  }

  // Build-time default (relative to the current page so it works under CloudFront).
  const configUrl = new URL("config.json", document.baseURI).toString();

  try {
    const res = await fetch(configUrl, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as RuntimeConfig;
      if (typeof data.apiBaseUrl === "string" && data.apiBaseUrl.trim() !== "") {
        cachedBaseUrl = normalizeBase(data.apiBaseUrl.trim());
        return cachedBaseUrl;
      }
    }
  } catch {
    // Ignore and fall through to the env fallback.
  }

  const fallback = envBaseUrl();
  cachedBaseUrl = fallback !== "" ? normalizeBase(fallback) : "";
  return cachedBaseUrl;
}

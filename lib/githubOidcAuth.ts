import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { NextRequest } from "next/server";

const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "oksp-pipeline-radar-virtualization-2024-2026";
const EXPECTED_REPOSITORY = "jboh0003-dev/oksp-pipeline-radar";
const EXPECTED_REF = "refs/heads/fix/virtualization-procurement-2024-2026";
const EXPECTED_WORKFLOW = EXPECTED_REPOSITORY + "/.github/workflows/virtualization-probe.yml@" + EXPECTED_REF;

function parseBase64Url(input: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
/** GitHub Actions OIDC: verify RSA signature, issuer, audience, repo, branch and workflow.
 * No shared secret or runtime auth token is printed or stored.
 */
export async function isAuthorizedBackfillWorkflow(request: NextRequest): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "preview") return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some(s => !s) || token.length > 12000) return false;
  const header = parseBase64Url(parts[0]);
  const claims = parseBase64Url(parts[1]);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return false;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== OIDC_ISSUER || claims.aud !== OIDC_AUDIENCE) return false;
  if (claims.repository !== EXPECTED_REPOSITORY || String(claims.repository_id ?? "") !== "1242981156") return false;
  if (claims.ref !== EXPECTED_REF || claims.workflow_ref !== EXPECTED_WORKFLOW) return false;
  if (claims.event_name !== "push") return false;
  if (typeof claims.exp !== "number" || now > claims.exp || claims.exp > now + 600) return false;
  if (typeof claims.iat !== "number" || claims.iat > now + 60 || claims.iat < now - 600) return false;
  try {
    const response = await fetch(OIDC_ISSUER + "/.well-known/jwks", { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return false;
    const json = await response.json() as { keys?: Array<Record<string, unknown>> };
    const jwk = json.keys?.find(k => k.kid === header.kid && k.kty === "RSA" && k.use === "sig");
    if (!jwk) return false;
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    return verifySignature("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), publicKey, Buffer.from(parts[2], "base64url"));
  } catch {
    return false;
  }
}

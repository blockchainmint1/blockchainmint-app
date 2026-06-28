/**
 * FCM HTTP v1 dispatcher. Server-only.
 *
 * Reads a Firebase service-account JSON from FCM_SERVICE_ACCOUNT_JSON, mints
 * an OAuth access token via a self-signed JWT (no SDK so it works inside the
 * Worker runtime), and POSTs messages to fcm.googleapis.com.
 *
 * When the secret is missing this no-ops cleanly — the rest of the watcher
 * still runs and writes alert rows; only the device-side push is skipped.
 */

import { createSign } from "crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type Cached = { token: string; expires: number };
let cachedToken: Cached | null = null;
let parsedSa: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (parsedSa) return parsedSa;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    parsedSa = JSON.parse(raw) as ServiceAccount;
    return parsedSa;
  } catch {
    return null;
  }
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;

  let signed: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    signed = b64url(signer.sign(sa.private_key));
  } catch (e) {
    console.error("[push] JWT sign failed", e);
    return null;
  }

  const jwt = `${signingInput}.${signed}`;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      console.error("[push] token exchange failed", res.status, await res.text());
      return null;
    }
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cachedToken = { token: j.access_token, expires: now + (j.expires_in ?? 3600) };
    return j.access_token;
  } catch (e) {
    console.error("[push] token exchange threw", e);
    return null;
  }
}

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

/** Returns true if a push was actually sent, false on no-op or failure. */
export async function sendPush(msg: PushMessage): Promise<boolean> {
  const sa = loadServiceAccount();
  if (!sa) return false; // credentials not configured; silent no-op
  const access = await getAccessToken(sa);
  if (!access) return false;

  const body = {
    message: {
      token: msg.token,
      notification: { title: msg.title, body: msg.body },
      data: msg.data ?? {},
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
      android: { priority: "HIGH" as const, notification: { sound: "default" } },
    },
  };
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${access}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.error("[push] send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[push] send threw", e);
    return false;
  }
}

export function isPushConfigured(): boolean {
  return !!loadServiceAccount();
}

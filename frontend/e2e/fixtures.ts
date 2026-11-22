import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { API_URL, E2E_JWT_SECRET, E2E_SUPABASE_URL } from "../playwright.config";

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** Signs a Supabase-shaped HS256 access token that the backend under test accepts. */
export function signToken(sub: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, email, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 }));
  const sig = createHmac("sha256", E2E_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Thin authenticated client for seeding data through the real API. */
export class Api {
  constructor(private request: APIRequestContext, private token: string) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async get<T>(path: string): Promise<T> {
    const r = await this.request.get(`${API_URL}${path}`, { headers: this.headers() });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const r = await this.request.post(`${API_URL}${path}`, { headers: this.headers(), data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }

  async categoryId(name: string): Promise<string> {
    const cats = await this.get<{ id: string; name: string }[]>("/api/categories");
    return cats.find((c) => c.name === name)!.id;
  }
}

type Fixtures = { user: { id: string; email: string; token: string }; api: Api };

/**
 * Every test gets its own user. The Supabase session is written to localStorage before the
 * app loads, exactly where supabase-js keeps it, so no Supabase project is needed.
 */
export const test = base.extend<Fixtures>({
  user: async ({}, use) => {
    const id = randomUUID();
    const email = `e2e-${id.slice(0, 8)}@spendlyzer.test`;
    await use({ id, email, token: signToken(id, email) });
  },
  api: async ({ request, user }, use) => {
    await use(new Api(request, user.token));
  },
  page: async ({ page, user }, use) => {
    const storageKey = `sb-${new URL(E2E_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
    const now = Math.floor(Date.now() / 1000);
    const session = JSON.stringify({
      access_token: user.token,
      refresh_token: "e2e-refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    });
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [storageKey, session] as const);
    await page.route(`${E2E_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ status: 204 }));
    await use(page);
  },
});

export { expect };

/**
 * Runs the real public/sw.js inside a simulated ServiceWorkerGlobalScope with in-memory
 * Cache Storage and a controllable network, so caching rules are tested deterministically.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const SOURCE = readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://app.spendlyzer.test";
const API = "https://api.spendlyzer.test";

class MemoryCache {
  store = new Map<string, Response>();
  private key(req: RequestInfo | URL, ignoreSearch = false) {
    const url = new URL(typeof req === "string" ? req : req instanceof URL ? req.href : req.url, ORIGIN);
    if (ignoreSearch) url.search = "";
    return url.href;
  }
  async match(req: RequestInfo | URL, opts?: { ignoreSearch?: boolean }) {
    if (opts?.ignoreSearch) {
      const want = this.key(req, true);
      for (const [k, v] of this.store) if (this.key(k, true) === want) return v.clone();
      return undefined;
    }
    return this.store.get(this.key(req))?.clone();
  }
  async put(req: RequestInfo | URL, res: Response) {
    this.store.set(this.key(req), res.clone());
  }
  async addAll(urls: string[]) {
    for (const u of urls) this.store.set(this.key(u), new Response(`precached ${u}`, { status: 200 }));
  }
}

class MemoryCaches {
  caches = new Map<string, MemoryCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new MemoryCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(req: RequestInfo | URL) {
    for (const c of this.caches.values()) {
      const hit = await c.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Handler = (event: any) => void;

function token(sub: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ sub })}.sig`;
}

function loadWorker(query = `v=build1&api=${encodeURIComponent(API)}`) {
  const listeners: Record<string, Handler[]> = {};
  const caches = new MemoryCaches();
  const network = { online: true, responses: new Map<string, () => Response>(), calls: [] as string[] };
  const fetchImpl = async (req: Request | string) => {
    const url = typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
    network.calls.push(url);
    if (!network.online) throw new TypeError("Failed to fetch");
    const make = network.responses.get(url);
    return make ? make() : new Response("not found", { status: 404 });
  };
  let skipped = false;
  let claimed = false;
  const self = {
    location: { href: `${ORIGIN}/sw.js?${query}`, origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (listeners[type] ||= []).push(fn),
    skipWaiting: () => {
      skipped = true;
    },
    clients: { claim: async () => void (claimed = true) },
  };
  new Function("self", "caches", "fetch", "atob", SOURCE)(self, caches, fetchImpl, (s: string) => Buffer.from(s, "base64").toString("binary"));

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    for (const fn of listeners[type] || []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  /** Dispatches a fetch event. Returns the Response, or null if the worker did not intercept. */
  async function dispatch(request: Request): Promise<Response | null> {
    let responded: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    for (const fn of listeners.fetch || []) {
      fn({ request, respondWith: (p: Promise<Response>) => (responded = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    }
    if (!responded) return null;
    const response = await responded;
    await Promise.all(waits); // like the browser, keep the worker alive until writes finish
    return response;
  }

  return {
    caches,
    network,
    lifecycle,
    dispatch,
    message: async (data: unknown) => {
      const waits: Promise<unknown>[] = [];
      (listeners.message || []).forEach((fn) => fn({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) }));
      await Promise.all(waits);
    },
    get skipped() {
      return skipped;
    },
    get claimed() {
      return claimed;
    },
  };
}

const nav = (p: string) => {
  const r = new Request(`${ORIGIN}${p}`);
  Object.defineProperty(r, "mode", { value: "navigate" });
  return r;
};
const apiGet = (p: string, sub?: string) => new Request(`${API}${p}`, { headers: sub ? { Authorization: `Bearer ${token(sub)}` } : {} });

describe("service worker", () => {
  let sw: ReturnType<typeof loadWorker>;

  beforeEach(async () => {
    sw = loadWorker();
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
  });

  it("precaches the offline shell on install and claims clients on activate", async () => {
    expect(await sw.caches.keys()).toContain("shell-build1");
    expect(await (await sw.caches.open("shell-build1")).match("/offline")).toBeDefined();
    expect(sw.claimed).toBe(true);
  });

  it("activation removes caches from old builds but keeps per-user API data", async () => {
    await sw.caches.open("shell-build0");
    await sw.caches.open("pages-build0");
    await sw.caches.open("api-user-a");
    await sw.lifecycle("activate");
    const keys = await sw.caches.keys();
    expect(keys).not.toContain("shell-build0");
    expect(keys).not.toContain("pages-build0");
    expect(keys).toContain("api-user-a");
  });

  it("navigations are network first and fall back to the saved page, then /offline", async () => {
    sw.network.responses.set(`${ORIGIN}/dashboard`, () => new Response("<html>dashboard v1</html>", { status: 200 }));
    expect(await (await sw.dispatch(nav("/dashboard")))!.text()).toBe("<html>dashboard v1</html>");

    sw.network.responses.set(`${ORIGIN}/dashboard`, () => new Response("<html>dashboard v2</html>", { status: 200 }));
    expect(await (await sw.dispatch(nav("/dashboard")))!.text()).toBe("<html>dashboard v2</html>");

    sw.network.online = false;
    expect(await (await sw.dispatch(nav("/dashboard")))!.text()).toBe("<html>dashboard v2</html>");
    expect(await (await sw.dispatch(nav("/dashboard?x=1")))!.text()).toBe("<html>dashboard v2</html>");
    expect(await (await sw.dispatch(nav("/budgets")))!.text()).toBe("precached /offline");
  });

  it("does not cache failed page responses", async () => {
    sw.network.responses.set(`${ORIGIN}/dashboard`, () => new Response("boom", { status: 500 }));
    await sw.dispatch(nav("/dashboard"));
    sw.network.online = false;
    expect(await (await sw.dispatch(nav("/dashboard")))!.text()).toBe("precached /offline");
  });

  it("static build assets are cache first", async () => {
    const url = `${ORIGIN}/_next/static/chunks/app-abc123.js`;
    sw.network.responses.set(url, () => new Response("chunk", { status: 200 }));
    await sw.dispatch(new Request(url));
    sw.network.calls.length = 0;
    expect(await (await sw.dispatch(new Request(url)))!.text()).toBe("chunk");
    expect(sw.network.calls).toEqual([]);
  });

  it("API GETs are network first, saved per user, and marked when served offline", async () => {
    sw.network.responses.set(`${API}/api/dashboard`, () => Response.json({ balance: "100.00" }));
    const fresh = await sw.dispatch(apiGet("/api/dashboard", "user-a"));
    expect(fresh!.headers.get("X-Spendlyzer-Offline")).toBeNull();
    expect(await sw.caches.keys()).toContain("api-user-a");

    sw.network.online = false;
    const offline = await sw.dispatch(apiGet("/api/dashboard", "user-a"));
    expect(await offline!.json()).toEqual({ balance: "100.00" });
    expect(offline!.headers.get("X-Spendlyzer-Offline")).toBe("1");
    expect(offline!.headers.get("X-Spendlyzer-Cached-At")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("never serves one user's saved data to another", async () => {
    sw.network.responses.set(`${API}/api/transactions`, () => Response.json({ items: ["a-secret"] }));
    await sw.dispatch(apiGet("/api/transactions", "user-a"));
    sw.network.online = false;
    await expect(sw.dispatch(apiGet("/api/transactions", "user-b"))).rejects.toThrow("Failed to fetch");
  });

  it("does not cache API error responses", async () => {
    sw.network.responses.set(`${API}/api/dashboard`, () => new Response("unauthorized", { status: 401 }));
    await sw.dispatch(apiGet("/api/dashboard", "user-a"));
    sw.network.online = false;
    await expect(sw.dispatch(apiGet("/api/dashboard", "user-a"))).rejects.toThrow();
  });

  it("leaves writes, unauthenticated calls, other origins and malformed tokens alone", async () => {
    expect(await sw.dispatch(new Request(`${API}/api/transactions`, { method: "POST", body: "{}", headers: { Authorization: `Bearer ${token("u")}` } }))).toBeNull();
    expect(await sw.dispatch(apiGet("/api/transactions"))).toBeNull();
    expect(await sw.dispatch(new Request("https://e2e.supabase.co/auth/v1/user"))).toBeNull();
    expect(await sw.dispatch(new Request(`${API}/api/x`, { headers: { Authorization: "Bearer not-a-jwt" } }))).toBeNull();
    expect(await sw.dispatch(new Request(`${API}/api/x`, { headers: { Authorization: `Bearer ${token("../../etc")}` } }))).toBeNull();
    expect(await sw.dispatch(new Request(`${API}/health`, { headers: { Authorization: `Bearer ${token("u")}` } }))).toBeNull();
  });

  it("activates a waiting update only when asked", async () => {
    expect(sw.skipped).toBe(false);
    await sw.message({ type: "SOMETHING_ELSE" });
    expect(sw.skipped).toBe(false);
    await sw.message({ type: "SKIP_WAITING" });
    expect(sw.skipped).toBe(true);
  });

  it("saves pages reached by in-app navigation so they open offline", async () => {
    sw.network.responses.set(`${ORIGIN}/insights`, () => new Response("<html>insights</html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
    await sw.message({ type: "CACHE_PAGE", path: "/insights?tab=x" });
    sw.network.online = false;
    expect(await (await sw.dispatch(nav("/insights")))!.text()).toBe("<html>insights</html>");
  });

  it("does not refetch pages that are already saved, and ignores other origins and non-HTML", async () => {
    sw.network.responses.set(`${ORIGIN}/dashboard`, () => new Response("<html>d</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    sw.network.responses.set(`${ORIGIN}/data.json`, () => Response.json({}));
    await sw.dispatch(nav("/dashboard"));
    sw.network.calls.length = 0;
    await sw.message({ type: "CACHE_PAGE", path: "/dashboard" });
    await sw.message({ type: "CACHE_PAGE", path: "https://evil.test/x" });
    await sw.message({ type: "CACHE_PAGE", path: "/data.json" });
    expect(sw.network.calls).toEqual([`${ORIGIN}/data.json`]);
    sw.network.online = false;
    expect(await (await sw.dispatch(nav("/data.json")))!.text()).toBe("precached /offline");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { getSession } }) }));

import { api, ApiError, qs } from "@/lib/api";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
  });

  it("attaches the bearer token and JSON content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    const out = await api<{ ok: boolean }>("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/x");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does not set Content-Type for FormData", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, {}));
    await api("/api/upload", { method: "POST", body: new FormData() });
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("omits Authorization when signed out", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, {}));
    await api("/api/x");
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("returns undefined for 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("surfaces string error details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(404, { detail: "Transaction not found" }));
    await expect(api("/api/x")).rejects.toMatchObject({ status: 404, message: "Transaction not found" });
  });

  it("flattens FastAPI validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(422, { detail: [{ loc: ["body", "amount"], msg: "Input should be greater than 0" }] }),
    );
    await expect(api("/api/x")).rejects.toThrow("amount: Input should be greater than 0");
  });

  it("falls back to a generic message for non-JSON errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(api("/api/x")).rejects.toThrow("Request failed (500)");
  });

  it("reports network failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await api("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Cannot reach the API/);
  });
});

describe("qs", () => {
  it("drops empty values and encodes the rest", () => {
    expect(qs({ a: "x y", b: "", c: null, d: undefined, e: 0, f: false })).toBe("?a=x+y&e=0&f=false");
    expect(qs({})).toBe("");
  });
});

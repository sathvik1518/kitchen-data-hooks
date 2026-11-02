import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiError, placeOrder, requestJSON } from "./api";
import { server } from "./test/server";

describe("requestJSON", () => {
  it("returns the parsed JSON", async () => {
    expect(await requestJSON("/api/menu")).toHaveLength(4);
  });
  it("treats a 500 as an error (fetch itself would not)", async () => {
    server.use(http.get("/api/menu", () => HttpResponse.json({ detail: "The kitchen is closed." }, { status: 500 })));
    const error = await requestJSON("/api/menu").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("The kitchen is closed.");
  });
  it("copes with an error that has no JSON body", async () => {
    server.use(http.get("/api/menu", () => new HttpResponse("oops", { status: 502, statusText: "Bad Gateway" })));
    const error = await requestJSON("/api/menu").catch((e) => e);
    expect(error.status).toBe(502);
    expect(error.message).toBe("Bad Gateway");
  });
  it("turns a network failure into a friendly ApiError with status 0", async () => {
    server.use(http.get("/api/menu", () => HttpResponse.error()));
    const error = await requestJSON("/api/menu").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe("Could not reach the server.");
  });
  it("lets an AbortError through unchanged", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await requestJSON("/api/menu", { signal: controller.signal }).catch((e) => e);
    expect(error.name).toBe("AbortError");
  });
});

describe("placeOrder", () => {
  it("sends JSON and returns the created order", async () => {
    const order = await placeOrder({ table: "5", lines: [{ id: 1, qty: 2 }] });
    expect(order).toMatchObject({ id: 501, table: 5, total: 80 });
  });
  it("rejects with the server's message when the table is refused", async () => {
    const error = await placeOrder({ table: "13", lines: [{ id: 1, qty: 1 }] }).catch((e) => e);
    expect(error.status).toBe(409);
    expect(error.message).toMatch(/Table 13/);
  });
});

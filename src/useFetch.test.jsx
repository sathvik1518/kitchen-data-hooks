import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server, gate } from "./test/server";
import { useFetch } from "./useFetch";

describe("useFetch", () => {
  it("starts loading, then gives the data", async () => {
    const { result } = renderHook(() => useFetch("/api/menu"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(4);
    expect(result.current.error).toBeNull();
  });

  it("gives an error (and no data) when the server fails", async () => {
    server.use(http.get("/api/menu", () => HttpResponse.json({ detail: "Down." }, { status: 500 })));
    const { result } = renderHook(() => useFetch("/api/menu"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error.message).toBe("Down.");
    expect(result.current.data).toBeNull();
  });

  it("with url null it loads nothing and makes no request", async () => {
    let requests = 0;
    server.use(http.get("/api/menu", () => (requests++, HttpResponse.json([]))));
    const { result } = renderHook(() => useFetch(null));
    expect(result.current).toMatchObject({ loading: false, data: null, error: null });
    await new Promise((r) => setTimeout(r, 30));
    expect(requests).toBe(0);
  });

  it("refetch loads again and clears the old error", async () => {
    let fail = true;
    server.use(http.get("/api/menu", () => (fail ? HttpResponse.json({ detail: "Down." }, { status: 500 }) : HttpResponse.json([{ id: 9, name: "Tea", price: 10 }]))));
    const { result } = renderHook(() => useFetch("/api/menu"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    fail = false;
    act(() => result.current.refetch());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual([{ id: 9, name: "Tea", price: 10 }]));
  });

  it("a slow OLD answer can never overwrite the NEW one", async () => {
    const slow = gate();
    server.use(
      http.get("/api/list", async ({ request }) => {
        const which = new URL(request.url).searchParams.get("q");
        if (which === "old") await slow.promise;
        return HttpResponse.json({ which });
      }),
    );
    const { result, rerender } = renderHook(({ url }) => useFetch(url), { initialProps: { url: "/api/list?q=old" } });
    rerender({ url: "/api/list?q=new" });
    await waitFor(() => expect(result.current.data).toEqual({ which: "new" }));
    slow.open(); // the old answer now arrives, late
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.data).toEqual({ which: "new" });
  });

  it("does not update after the screen is gone", async () => {
    const hold = gate();
    server.use(http.get("/api/menu", async () => (await hold.promise, HttpResponse.json([]))));
    const { unmount } = renderHook(() => useFetch("/api/menu"));
    unmount();
    hold.open();
    await new Promise((r) => setTimeout(r, 30)); // a late update would trip the console.error check
  });
});

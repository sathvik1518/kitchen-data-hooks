import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMutation } from "./useMutation";

const defer = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("useMutation", () => {
  it("does nothing until mutate is called", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useMutation(fn));
    expect(result.current.status).toBe("idle");
    expect(fn).not.toHaveBeenCalled();
  });

  it("goes idle -> pending -> success and calls onSuccess", async () => {
    const d = defer();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useMutation(() => d.promise));
    act(() => void result.current.mutate({ a: 1 }, { onSuccess }));
    expect(result.current.status).toBe("pending");
    expect(result.current.isPending).toBe(true);
    await act(async () => d.resolve({ id: 5 }));
    expect(result.current).toMatchObject({ status: "success", data: { id: 5 }, isPending: false });
    expect(onSuccess).toHaveBeenCalledWith({ id: 5 });
  });

  it("passes the variables to the function", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useMutation(fn));
    await act(async () => result.current.mutate({ table: "4" }));
    expect(fn).toHaveBeenCalledWith({ table: "4" });
  });

  it("an error goes to state and onError, and mutate does not throw", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useMutation(() => Promise.reject(new Error("nope"))));
    await act(async () => {
      await result.current.mutate({}, { onError });
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error.message).toBe("nope");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("a new mutate clears the previous error", async () => {
    let fail = true;
    const { result } = renderHook(() => useMutation(() => (fail ? Promise.reject(new Error("x")) : Promise.resolve(1))));
    await act(async () => result.current.mutate({}));
    expect(result.current.error).not.toBeNull();
    fail = false;
    await act(async () => result.current.mutate({}));
    expect(result.current).toMatchObject({ status: "success", error: null });
  });

  it("only the NEWEST call may update the state", async () => {
    const first = defer();
    const second = defer();
    const queue = [first, second];
    const { result } = renderHook(() => useMutation(() => queue.shift().promise));
    act(() => void result.current.mutate({}));
    act(() => void result.current.mutate({}));
    await act(async () => second.resolve("second"));
    await act(async () => first.resolve("first")); // the older one finishes last
    expect(result.current.data).toBe("second");
  });

  it("reset goes back to idle, and a late answer is ignored", async () => {
    const d = defer();
    const { result } = renderHook(() => useMutation(() => d.promise));
    act(() => void result.current.mutate({}));
    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
    await act(async () => d.resolve("late"));
    expect(result.current.status).toBe("idle");
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// React reports mistakes (a missing key, a bad update) with console.error.
// Any console.error fails the test, so mistakes cannot hide in the output.
let errorSpy;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  const calls = errorSpy.mock.calls.map((c) => c.join(" "));
  errorSpy.mockRestore();
  expect(calls, "console.error was called during the test").toEqual([]);
});

// The fake server: every test starts from the normal answers.
import { afterAll, beforeAll } from "vitest";
import { orderCalls, server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  orderCalls.length = 0;
});
afterAll(() => server.close());

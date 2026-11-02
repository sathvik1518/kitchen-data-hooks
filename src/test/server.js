import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MENU, USER, createOrder } from "../serverRules";

// Tests can hold a response back until they say go, to look at the "loading" screen.
export function gate() {
  let open;
  const promise = new Promise((resolve) => (open = resolve));
  return { promise, open };
}

export const orderCalls = []; // every body the fake server received

export const handlers = [
  http.get("/api/menu", () => HttpResponse.json(MENU)),
  http.get("/api/me", () => HttpResponse.json(USER)),
  http.post("/api/orders", async ({ request }) => {
    const payload = await request.json();
    orderCalls.push(payload);
    const { status, body } = createOrder(payload, 501);
    return HttpResponse.json(body, { status });
  }),
];

export const server = setupServer(...handlers);

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { MENU, USER, createOrder } from "./src/serverRules.js";

/**
 * A tiny fake server for `npm run dev`, using the SAME rules as the tests (src/serverRules.js).
 *   GET  /api/menu         (add ?fail=1 to make it fail)
 *   GET  /api/me           (add ?guest=1 for "not signed in")
 *   POST /api/orders       (table 13 is always refused)
 * It answers slowly on purpose, so the loading states can be seen.
 */
function fakeApi() {
  let nextId = 1001;
  return {
    name: "fake-api",
    configureServer(server) {
      server.middlewares.use("/api", (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        const respond = (fn, delay = 700) => setTimeout(fn, delay);

        if (req.method === "GET" && url.pathname === "/menu") {
          return respond(() => (url.searchParams.get("fail") ? send(500, { detail: "The kitchen is closed." }) : send(200, MENU)));
        }
        if (req.method === "GET" && url.pathname === "/me") {
          return respond(() => (url.searchParams.get("guest") ? send(401, { detail: "Not signed in." }) : send(200, USER)), 300);
        }
        if (req.method === "POST" && url.pathname === "/orders") {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            let payload;
            try {
              payload = JSON.parse(raw || "{}");
            } catch {
              return send(400, { detail: "Bad JSON." });
            }
            respond(() => {
              const result = createOrder(payload, nextId);
              if (result.status === 201) nextId++;
              send(result.status, result.body);
            }, 900);
          });
          return;
        }
        send(404, { detail: "Not found." });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fakeApi()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
  },
});

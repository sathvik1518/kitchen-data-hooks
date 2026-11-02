# Kitchen Data & Hooks: Real Menu Loading, an Order Mutation and a UserContext

**Day 24 Mini Capstone, Data & Hooks**  
**Project folder:** `kitchen-data-hooks`

---

## 1. Goal

The Kitchen App stops using hardcoded data. The task (Day 24 Deep Dive, Mini Capstone) asked for:

1. A **`useFetch`-based menu load** with proper **loading** and **error** states.
2. A **mutation hook for placing an order**, built by hand.
3. A **`UserContext`** that gives the logged-in user to the **header** and the **checkout form** without **prop drilling**.

Think of a restaurant that used to read the menu from a card in your pocket. Now it phones the kitchen. While the phone rings, you need a message ("Calling the kitchen..."). If nobody picks up, you need a different message and a way to call again. *Placing an order* is a different kind of call: you are not asking a question, you are changing something, so it only happens when you press the button. *Context* is the name badge on the waiter: anyone in the restaurant can read it without the badge being handed from person to person.

The rules this project is built around:

- **Every request has three outcomes, and the screen shows all three:** waiting, failed, worked. A screen that only handles "worked" is broken half the time.
- **A late answer must never beat a newer one.** If the url changes while an old request is still running, the old request is cancelled.
- **Reading data and changing data are different hooks.** `useFetch` runs by itself. `useMutation` waits for `mutate()`.
- **The server decides prices.** The order sends dish ids and quantities, never prices.

---

## 2. Tools

| Tool | Role |
|---|---|
| React 19 (JavaScript, JSX) | Hooks, context and `useReducer` |
| Vite | Dev server and build. A small plugin inside `vite.config.js` is the fake server for `npm run dev` |
| Vitest + jsdom | Test runner and fake browser |
| React Testing Library + user-event | Render the screens, act like a user, test hooks with `renderHook` |
| MSW (Mock Service Worker) | A fake server for the tests, so the real `fetch` code runs |

---

## 3. Project structure

```
kitchen-data-hooks/
├── package.json
├── vite.config.js        (also holds the fake API for npm run dev)
├── index.html
├── .gitignore
├── README.md
├── DOCUMENTATION.md
└── src/
    ├── serverRules.js        (menu, user, and the order rules; shared by dev server and tests)
    ├── api.js                (requestJSON, ApiError, placeOrder)
    ├── useFetch.js           (read data)
    ├── useMutation.js        (change data)
    ├── UserContext.jsx       (UserProvider, useUser)
    ├── cartReducer.js        (cart rules as a reducer)
    ├── Header.jsx            (reads the user from context)
    ├── Menu.jsx
    ├── Cart.jsx
    ├── CheckoutForm.jsx      (reads the user from context, uses useMutation)
    ├── App.jsx
    ├── App.css
    ├── main.jsx
    ├── api.test.js, cartReducer.test.js, useFetch.test.jsx, useMutation.test.jsx
    ├── UserContext.test.jsx, App.test.jsx
    └── test/
        ├── setup.js          (rules for every test, starts the fake server)
        └── server.js         (the fake server's normal answers)
```

---

## 4. Setup commands

```bash
npm create vite@latest kitchen-data-hooks -- --template react
cd kitchen-data-hooks
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw
```

**`package.json` scripts**

```json
"dev": "vite",
"build": "vite build",
"test": "vitest run"
```

---

## 5. The idea: three outcomes, and who owns what

| Thing | Hook / tool | Runs when |
|---|---|---|
| Menu | `useFetch("/api/menu")` | On screen load, and again on `refetch()` |
| Logged-in user | `useFetch("/api/me")` inside `UserProvider`, shared by context | Once |
| Place an order | `useMutation(placeOrder)` | Only when `mutate()` is called |
| Cart | `useReducer(cartReducer)` | On each action |

```
 menu:   loading ──▶ data  ──▶ <Menu/>
                 └─▶ error ──▶ message + [Try again] ──▶ refetch ──▶ loading ...

 order:  idle ──mutate()──▶ pending ──▶ success ──▶ cart cleared
                                   └─▶ error   ──▶ message on the field, cart kept

 user:   <UserProvider> ──fetch /api/me──▶ { status, user } ──▶ <Header/> and <CheckoutForm/>
```

**Why `fetch` needs `res.ok`.** `fetch` only fails if the network is dead. A 404 or 500 is still a "successful" fetch. `requestJSON` checks `res.ok` and throws an `ApiError` carrying the status and the server's message.

**How `useFetch` avoids the late-answer bug.** The effect creates an `AbortController`. Its cleanup runs when the url changes or the screen goes away, and calls `abort()`. The old request is cancelled and its `AbortError` is ignored. An old answer can never arrive after a new one and overwrite it.

**Why `useMutation` numbers its calls.** If the person presses twice, two requests are in flight. A counter lets only the newest one write to the state, so the screen never shows an older result.

**Why the user has four statuses.** `loading`, `signedIn`, `signedOut` (a 401) and `error` (anything else). If a server crash looked like "signed out", a person who is signed in would be told to sign in again.

**Why checkout waits while the user loads.** Without the `loading` branch, checkout would flash "Please sign in" for a moment on every page load.

**How errors reach the right place.** The server's message goes in a `role="alert"` paragraph, linked to the table field with `aria-describedby`, and the field gets `aria-invalid`. A refused table keeps the cart so nothing is lost.

---

## 6. The code

### `src/serverRules.js` (what the server decides)

```js
// The server's rules as plain code. The fake server in the tests and the one for `npm run dev`
// both use this, so they behave the same.

export const MENU = [
  { id: 1, name: "Idli", price: 40 },
  { id: 2, name: "Dosa", price: 70 },
  { id: 3, name: "Pongal", price: 60 },
  { id: 4, name: "Filter Coffee", price: 30 },
];

export const USER = { id: 7, name: "Asha Rao", email: "asha@example.com" };

export const MAX_TABLE = 20;
export const UNAVAILABLE_TABLE = 13; // always "taken", so a refusal can be seen

/**
 * Checks an order and builds it. Returns { status, body }.
 *   201 the order      400 bad shape      409 table not available      422 field errors
 */
export function createOrder(payload, nextId = Date.now()) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : null;
  if (!lines || lines.length === 0) return { status: 400, body: { detail: "An order needs at least one item." } };

  const errors = {};
  const table = Number(payload.table);
  if (!Number.isInteger(table) || table < 1 || table > MAX_TABLE) errors.table = `Table must be from 1 to ${MAX_TABLE}.`;
  if (Object.keys(errors).length > 0) return { status: 422, body: { detail: "Please fix the form.", errors } };

  let total = 0;
  for (const { id, qty } of lines) {
    const dish = MENU.find((d) => d.id === id);
    if (!dish || !Number.isInteger(qty) || qty < 1 || qty > 10) {
      return { status: 400, body: { detail: "An item in the order is not valid." } };
    }
    total += dish.price * qty; // the price always comes from the server, never from the client
  }

  if (table === UNAVAILABLE_TABLE) {
    return { status: 409, body: { detail: `Table ${UNAVAILABLE_TABLE} is not available. Pick another table.`, errors: { table: "Not available." } } };
  }
  return { status: 201, body: { id: nextId, table, total, lines } };
}
```

### `src/api.js`

```js
/** A failed request: `status` is the HTTP status, or 0 if no answer came at all. */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Sends a request and returns the parsed JSON.
 * `fetch` only fails on a network problem. A 404 or 500 is a "successful" fetch, so `res.ok` is checked.
 */
export async function requestJSON(url, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error; // cancelled on purpose: not a failure to report
    throw new ApiError("Could not reach the server.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body, or not JSON
  }
  if (!res.ok) throw new ApiError(typeof data?.detail === "string" ? data.detail : res.statusText || `HTTP ${res.status}`, res.status);
  return data;
}

export const placeOrder = (payload) => requestJSON("/api/orders", { method: "POST", body: payload });
```

### `src/useFetch.js` (read data)

```js
import { useCallback, useEffect, useState } from "react";
import { requestJSON } from "./api";

/**
 * Loads `url` and keeps three things: `data`, `error` and `loading`.
 *   - starts again when `url` changes
 *   - cancels the old request when the url changes or the screen goes away
 *   - `refetch()` loads again (for a "Try again" button)
 * `url` can be null: nothing is loaded (useful when you are not ready yet).
 */
export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: url !== null });
  const [attempt, setAttempt] = useState(0); // changing this makes the effect run again

  useEffect(() => {
    if (url === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, error: null, loading: true }));

    requestJSON(url, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name === "AbortError") return; // a newer request took over, or the screen is gone
        setState({ data: null, error, loading: false });
      });

    // The cleanup runs when `url` changes or the screen goes away. Aborting means an old
    // answer can never arrive late and overwrite a newer one.
    return () => controller.abort();
  }, [url, attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, refetch };
}
```

### `src/useMutation.js` (change data)

```js
import { useCallback, useRef, useState } from "react";

/**
 * For things that CHANGE data (place an order). Unlike useFetch it does not run by itself:
 * it waits until you call `mutate(variables)`.
 *   status: "idle" | "pending" | "success" | "error"
 *   mutate(variables, { onSuccess, onError })   never throws; errors go to `error` and `onError`
 *   reset()                                     back to "idle"
 */
export function useMutation(mutationFn) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const latest = useRef(0); // numbers the calls, so only the newest one may update the state

  const mutate = useCallback(
    async (variables, { onSuccess, onError } = {}) => {
      const call = ++latest.current;
      setState({ status: "pending", data: null, error: null });
      try {
        const data = await mutationFn(variables);
        if (call === latest.current) setState({ status: "success", data, error: null });
        onSuccess?.(data);
      } catch (error) {
        if (call === latest.current) setState({ status: "error", data: null, error });
        onError?.(error);
      }
    },
    [mutationFn],
  );

  const reset = useCallback(() => {
    latest.current++;
    setState({ status: "idle", data: null, error: null });
  }, []);

  return { ...state, isPending: state.status === "pending", mutate, reset };
}
```

### `src/UserContext.jsx` (no prop drilling)

```jsx
import { createContext, useContext } from "react";
import { useFetch } from "./useFetch";

const UserContext = createContext(null); // null means "no provider above me"

/**
 * Loads the logged-in user once and shares it with everything below.
 * Any component can read it with useUser(), however deep it sits, so nothing has to pass it down.
 *   status: "loading" | "signedIn" | "signedOut" | "error"
 */
export function UserProvider({ url = "/api/me", children }) {
  const { data, error, loading } = useFetch(url);

  let value;
  if (loading) value = { status: "loading", user: null };
  else if (data) value = { status: "signedIn", user: data };
  else if (error?.status === 401) value = { status: "signedOut", user: null };
  else value = { status: "error", user: null };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const value = useContext(UserContext);
  if (value === null) throw new Error("useUser must be used inside a <UserProvider>.");
  return value;
}
```

### `src/cartReducer.js`

```js
// The cart as a reducer: one function that says how each ACTION changes the cart.
// The cart is an array of { dish, qty }. The reducer never changes the old array.

export const MAX_QTY = 10;

export function cartReducer(cart, action) {
  switch (action.type) {
    case "add": {
      const { dish } = action;
      const line = cart.find((l) => l.dish.id === dish.id);
      if (!line) return [...cart, { dish, qty: 1 }];
      return cart.map((l) => (l.dish.id === dish.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l));
    }
    case "remove":
      return cart.filter((l) => l.dish.id !== action.dishId);
    case "clear":
      return [];
    default:
      throw new Error(`Unknown cart action: ${action.type}`);
  }
}

export const cartTotal = (cart) => cart.reduce((sum, l) => sum + l.dish.price * l.qty, 0);
export const cartCount = (cart) => cart.reduce((sum, l) => sum + l.qty, 0);
```

### `src/Header.jsx` (reads context, no props)

```jsx
import { useUser } from "./UserContext";

// Reads the user from context. It receives no props.
export default function Header() {
  const { status, user } = useUser();
  return (
    <header className="row">
      <h1>Kitchen</h1>
      <p aria-live="polite">
        {status === "loading" && "Signing in..."}
        {status === "signedIn" && <>Signed in as {user.name}</>}
        {status === "signedOut" && "You are not signed in."}
        {status === "error" && "Could not check your sign-in."}
      </p>
    </header>
  );
}
```

### `src/Menu.jsx`

```jsx
export default function Menu({ dishes, onAdd }) {
  if (dishes.length === 0) return <p>The menu is empty.</p>;
  return (
    <ul>
      {dishes.map((dish) => (
        <li key={dish.id} className="row">
          <span>
            {dish.name} <small>₹{dish.price}</small>
          </span>
          <button type="button" aria-label={`Add ${dish.name} to cart`} onClick={() => onAdd(dish)}>
            Add
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### `src/Cart.jsx`

```jsx
export default function Cart({ lines, total, onRemove }) {
  if (lines.length === 0) return <p>Your cart is empty.</p>;
  return (
    <>
      <ul>
        {lines.map(({ dish, qty }) => (
          <li key={dish.id} className="row">
            <span>
              {qty} × {dish.name} <small>₹{dish.price * qty}</small>
            </span>
            <button type="button" aria-label={`Remove ${dish.name}`} onClick={() => onRemove(dish.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p>
        <strong>Total: ₹{total}</strong>
      </p>
    </>
  );
}
```

### `src/CheckoutForm.jsx` (reads context, uses the mutation)

```jsx
import { useState } from "react";
import { placeOrder } from "./api";
import { useMutation } from "./useMutation";
import { useUser } from "./UserContext";

/** The checkout form. It gets the signed-in user from context, so App does not pass it down. */
export default function CheckoutForm({ lines, onPlaced }) {
  const { status, user } = useUser();
  const [table, setTable] = useState("");
  const order = useMutation(placeOrder);

  if (status === "loading") return <p>Checking your sign-in...</p>;
  if (status !== "signedIn") return <p>Please sign in to place an order.</p>;

  function submit(event) {
    event.preventDefault();
    if (order.isPending) return;
    order.mutate(
      { table: table.trim(), lines: lines.map(({ dish, qty }) => ({ id: dish.id, qty })) },
      { onSuccess: (placed) => onPlaced(placed) },
    );
  }

  const tableError = order.error?.status === 422 || order.error?.status === 409;
  return (
    <form onSubmit={submit} noValidate>
      <p>
        Ordering as <strong>{user.name}</strong>
      </p>
      <label htmlFor="table">Table number</label>
      <input
        id="table"
        value={table}
        onChange={(e) => setTable(e.target.value)}
        inputMode="numeric"
        aria-invalid={tableError ? "true" : undefined}
        aria-describedby={order.error ? "order-error" : undefined}
      />
      {order.error && (
        <p id="order-error" role="alert" className="field-error">
          {order.error.message}
        </p>
      )}
      {order.status === "success" && <p role="status">Order #{order.data.id} placed. Thank you, {user.name}!</p>}
      <button type="submit" disabled={order.isPending || lines.length === 0}>
        {order.isPending ? "Placing order..." : "Place order"}
      </button>
    </form>
  );
}
```

### `src/App.jsx`

```jsx
import { useReducer } from "react";
import Cart from "./Cart";
import CheckoutForm from "./CheckoutForm";
import { cartCount, cartReducer, cartTotal } from "./cartReducer";
import Header from "./Header";
import Menu from "./Menu";
import { UserProvider } from "./UserContext";
import { useFetch } from "./useFetch";
import "./App.css";

function MenuSection({ url, onAdd }) {
  const { data, error, loading, refetch } = useFetch(url);
  if (loading) return <p role="status">Loading the menu...</p>;
  if (error) {
    return (
      <div role="alert">
        <p>Could not load the menu: {error.message}</p>
        <button type="button" onClick={refetch}>
          Try again
        </button>
      </div>
    );
  }
  return <Menu dishes={data} onAdd={onAdd} />;
}

export default function App({ menuUrl = "/api/menu", userUrl = "/api/me" }) {
  const [cart, dispatch] = useReducer(cartReducer, []);

  return (
    <UserProvider url={userUrl}>
      <main className="kitchen">
        <Header />

        <section aria-labelledby="menu-title">
          <h2 id="menu-title">Menu</h2>
          <MenuSection url={menuUrl} onAdd={(dish) => dispatch({ type: "add", dish })} />
        </section>

        <section aria-labelledby="cart-title">
          <h2 id="cart-title">Your cart ({cartCount(cart)})</h2>
          <Cart lines={cart} total={cartTotal(cart)} onRemove={(dishId) => dispatch({ type: "remove", dishId })} />
        </section>

        <section aria-labelledby="checkout-title">
          <h2 id="checkout-title">Checkout</h2>
          <CheckoutForm lines={cart} onPlaced={() => dispatch({ type: "clear" })} />
        </section>
      </main>
    </UserProvider>
  );
}
```

### `src/main.jsx`

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Two switches to see the failure screens in the browser:
//   http://localhost:5173/?menu=fail   the menu request fails
//   http://localhost:5173/?guest=1     nobody is signed in
const params = new URLSearchParams(window.location.search);
const menuUrl = params.get("menu") === "fail" ? "/api/menu?fail=1" : "/api/menu";
const userUrl = params.get("guest") ? "/api/me?guest=1" : "/api/me";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App menuUrl={menuUrl} userUrl={userUrl} />
  </StrictMode>,
);
```

### `vite.config.js` (test setup and the fake API for npm run dev)

```js
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
```

### Design decisions

| Decision | Reason |
|---|---|
| `requestJSON` checks `res.ok` | `fetch` does not fail on 404 or 500. Without the check, an error page is treated as data. |
| `ApiError` has a `status` | The screen can tell a refused table (409) from a crash (500) from no network (0). |
| A dead network becomes "Could not reach the server." | The browser's own message ("Failed to fetch") means nothing to a customer. |
| The error body may be missing or not JSON | A 502 from a proxy has no JSON. The code falls back to the status text instead of crashing. |
| `useFetch` aborts in the effect cleanup | Stops a slow old request from overwriting a newer one, and stops updates after the screen is gone. |
| `AbortError` is ignored, not shown | Cancelling is on purpose, not a failure. |
| `useFetch(null)` loads nothing | Lets a screen wait until it has what it needs, with no fake request. |
| `refetch` clears the old error first | "Try again" shows loading, not the old error while it retries. |
| `useMutation` does not run by itself | Placing an order changes data. It must never happen because a screen redrew. |
| `mutate` never throws | Errors go to `error` and `onError`. A forgotten `try/catch` cannot crash the screen. |
| Calls are numbered and only the newest updates the state | Two quick presses cannot show the older result. |
| The button is disabled while pending, and `submit` also returns early | The disabled button stops a click. The early return stops anything else calling `submit` twice. |
| The order sends `{ id, qty }`, never prices | A customer must not be able to set their own price. The server looks it up (`serverRules.js`). |
| The table value is trimmed before sending | ` 5 ` reaches the server as `5`. |
| A refused order keeps the cart | The person fixes the table and presses again. Nothing is lost. |
| Only a success clears the cart | Clearing on error would throw away the order the person was building. |
| `UserProvider` fetches once and shares `{ status, user }` | Header and checkout read the same answer. One request, not two. |
| `useUser` throws outside a provider | A missing provider is a mistake in the code. A clear message beats a crash on `null.name`. |
| The context value is `null` by default, not `{}` | `null` lets the hook tell "no provider" apart from "provider with nothing yet". |
| Cart is a reducer | The rules for add, remove and clear sit in one tested function. `App` only says what happened. |
| The reducer throws on an unknown action | A typo (`"ad"`) is noticed at once, not ignored. |
| One `serverRules.js` shared by the dev API and the tests | The fake server in the browser and in the tests cannot drift apart. |
| `onUnhandledRequest: "error"` in the test server | A request nobody planned for fails the test instead of silently hitting the network. |
| The fake dev server is slow on purpose | Loading and pending states can actually be seen with your eyes. |

---

## 7. Tests (48 tests)

Hooks are tested with `renderHook`. Screens are tested like a person uses them. The fake server (MSW) answers the real `fetch` calls, so the actual request code runs. A test can **hold** a response back until it says go, which is how the loading and pending screens are checked. A test can also make the server fail. Any `console.error` fails a test (see `src/test/setup.js`).

| # | Test | What it proves |
|---|---|---|
| 1 to 7 | `api.js`: returns JSON; a 500 becomes an `ApiError` with the server's message; an error with no JSON body; a dead network; an `AbortError` passes through; `placeOrder` success; refused table | Requests |
| 8 to 15 | `cartReducer`: add, add twice, max quantity, remove, clear, no mutation (frozen input), unknown action throws, total and count | Cart rules |
| 16 to 21 | `useFetch`: loading then data; error; `null` makes no request; `refetch` clears the error and recovers; a slow old answer cannot overwrite a new one; no update after unmount | Read hook |
| 22 to 28 | `useMutation`: idle until called; idle, pending, success; variables passed; error goes to state and `onError` without throwing; a new call clears the old error; only the newest call updates; `reset` | Change hook |
| 29 to 32 | `UserProvider`: loading then signed in (read by a deeply nested child); 401 is signed out; 500 is error, not signed out; `useUser` outside a provider throws | Context |
| 33 to 48 | `App`: loading text then menu; error with Try again that recovers; empty menu; network failure; header and checkout both show the user; signed out; checkout waits while the user loads; `/me` crash is not "signed out"; cart add and remove; empty-cart button disabled; order sends only ids and quantities, shows pending, ignores a second click, succeeds and empties the cart; refused table shows an alert tied to the field and keeps the cart; fix and resend; 422; network failure keeps the cart | Everything together |

### `src/test/setup.js`

```js
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
```

### `src/test/server.js`

```js
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
```

### `src/api.test.js`

```js
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
```

### `src/cartReducer.test.js`

```js
import { describe, expect, it } from "vitest";
import { MAX_QTY, cartCount, cartReducer, cartTotal } from "./cartReducer";

const idli = { id: 1, name: "Idli", price: 40 };
const dosa = { id: 2, name: "Dosa", price: 70 };

describe("cartReducer", () => {
  it("adds a new dish with quantity 1", () => {
    expect(cartReducer([], { type: "add", dish: idli })).toEqual([{ dish: idli, qty: 1 }]);
  });
  it("adding the same dish again raises the quantity instead of a second line", () => {
    const cart = cartReducer(cartReducer([], { type: "add", dish: idli }), { type: "add", dish: idli });
    expect(cart).toEqual([{ dish: idli, qty: 2 }]);
  });
  it("stops at the maximum quantity", () => {
    let cart = [];
    for (let i = 0; i < MAX_QTY + 5; i++) cart = cartReducer(cart, { type: "add", dish: idli });
    expect(cart[0].qty).toBe(MAX_QTY);
  });
  it("removes only the chosen dish", () => {
    const cart = [{ dish: idli, qty: 1 }, { dish: dosa, qty: 2 }];
    expect(cartReducer(cart, { type: "remove", dishId: 1 })).toEqual([{ dish: dosa, qty: 2 }]);
  });
  it("clears everything", () => {
    expect(cartReducer([{ dish: idli, qty: 3 }], { type: "clear" })).toEqual([]);
  });
  it("never changes the cart it was given", () => {
    const cart = Object.freeze([Object.freeze({ dish: idli, qty: 1 })]);
    expect(() => cartReducer(cart, { type: "add", dish: idli })).not.toThrow();
    expect(() => cartReducer(cart, { type: "add", dish: dosa })).not.toThrow();
    expect(() => cartReducer(cart, { type: "remove", dishId: 1 })).not.toThrow();
    expect(cart[0].qty).toBe(1);
  });
  it("throws on an unknown action, so a typo is noticed", () => {
    expect(() => cartReducer([], { type: "ad", dish: idli })).toThrow(/Unknown cart action/);
  });
  it("totals and counts", () => {
    const cart = [{ dish: idli, qty: 2 }, { dish: dosa, qty: 1 }];
    expect(cartTotal(cart)).toBe(150);
    expect(cartCount(cart)).toBe(3);
    expect(cartTotal([])).toBe(0);
  });
});
```

### `src/useFetch.test.jsx`

```jsx
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
```

### `src/useMutation.test.jsx`

```jsx
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
```

### `src/UserContext.test.jsx`

```jsx
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "./UserContext";
import { server, gate } from "./test/server";

// A deep child that reads the user. Nothing is passed to it.
function Deep() {
  const { status, user } = useUser();
  return <p>{status}:{user?.name ?? "-"}</p>;
}
const Wrapper = () => (
  <div><div><div><Deep /></div></div></div>
);

describe("UserProvider / useUser", () => {
  it("is 'loading' first, then 'signedIn' with the user, for a child many levels down", async () => {
    const hold = gate();
    server.use(http.get("/api/me", async () => (await hold.promise, HttpResponse.json({ id: 7, name: "Asha Rao" }))));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(screen.getByText("loading:-")).toBeInTheDocument();
    hold.open();
    expect(await screen.findByText("signedIn:Asha Rao")).toBeInTheDocument();
  });

  it("a 401 means 'signedOut'", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "no" }, { status: 401 })));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(await screen.findByText("signedOut:-")).toBeInTheDocument();
  });

  it("any other failure means 'error', which is NOT the same as signed out", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(await screen.findByText("error:-")).toBeInTheDocument();
  });

  it("useUser outside a provider throws a clear message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the thrown error
    expect(() => render(<Deep />)).toThrow(/inside a <UserProvider>/);
    spy.mockRestore();
  });
});
```

### `src/App.test.jsx`

```jsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import App from "./App";
import { gate, orderCalls, server } from "./test/server";

const setup = () => ({ user: userEvent.setup(), ...render(<App />) });
const add = (user, name) => user.click(screen.getByRole("button", { name: `Add ${name} to cart` }));

describe("menu loading", () => {
  it("shows a loading message, then the real menu from the server", async () => {
    const hold = gate();
    server.use(http.get("/api/menu", async () => (await hold.promise, HttpResponse.json([{ id: 1, name: "Idli", price: 40 }]))));
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the menu");
    hold.open();
    expect(await screen.findByText("Idli")).toBeInTheDocument();
    expect(screen.queryByText(/Loading the menu/)).not.toBeInTheDocument();
  });

  it("shows the server's message and a Try again button on failure, and Try again recovers", async () => {
    let fail = true;
    server.use(http.get("/api/menu", () => (fail ? HttpResponse.json({ detail: "The kitchen is closed." }, { status: 500 }) : HttpResponse.json([{ id: 1, name: "Idli", price: 40 }]))));
    const { user } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("The kitchen is closed.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Idli")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when the menu is empty", async () => {
    server.use(http.get("/api/menu", () => HttpResponse.json([])));
    setup();
    expect(await screen.findByText("The menu is empty.")).toBeInTheDocument();
  });

  it("tells the person when the server cannot be reached", async () => {
    server.use(http.get("/api/menu", () => HttpResponse.error()));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });
});

describe("user context", () => {
  it("the header and the checkout form both show the user, and App passes nothing down", async () => {
    setup();
    expect(await screen.findByText(/Signed in as Asha Rao/)).toBeInTheDocument();
    expect(await screen.findByText("Asha Rao", { selector: "strong" })).toBeInTheDocument();
  });

  it("signed out: header says so and checkout asks to sign in (no form)", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "x" }, { status: 401 })));
    setup();
    expect(await screen.findByText("You are not signed in.")).toBeInTheDocument();
    expect(screen.getByText("Please sign in to place an order.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Table number")).not.toBeInTheDocument();
  });

  it("while the user loads, checkout waits instead of flashing 'please sign in'", async () => {
    const hold = gate();
    server.use(http.get("/api/me", async () => (await hold.promise, HttpResponse.json({ id: 7, name: "Asha Rao" }))));
    setup();
    expect(screen.getByText("Signing in...")).toBeInTheDocument();
    expect(screen.getByText("Checking your sign-in...")).toBeInTheDocument();
    expect(screen.queryByText("Please sign in to place an order.")).not.toBeInTheDocument();
    hold.open();
    expect(await screen.findByLabelText("Table number")).toBeInTheDocument();
  });

  it("a server error on /me is shown as an error, not as 'signed out'", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    setup();
    expect(await screen.findByText("Could not check your sign-in.")).toBeInTheDocument();
  });
});

describe("cart", () => {
  it("adding dishes updates the lines, the count and the total", async () => {
    const { user } = setup();
    await screen.findByText("Idli");
    await add(user, "Idli");
    await add(user, "Idli");
    await add(user, "Dosa");
    expect(screen.getByRole("heading", { name: "Your cart (3)" })).toBeInTheDocument();
    expect(screen.getByText("Total: ₹150")).toBeInTheDocument();
    expect(screen.getByText(/2 × Idli/)).toBeInTheDocument();
  });

  it("removing a dish takes it out", async () => {
    const { user } = setup();
    await screen.findByText("Idli");
    await add(user, "Idli");
    await user.click(screen.getByRole("button", { name: "Remove Idli" }));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });
});

describe("placing an order (mutation)", () => {
  async function ready() {
    const ctx = setup();
    await screen.findByText("Idli");
    await screen.findByLabelText("Table number");
    return ctx;
  }

  it("the button is disabled while the cart is empty", async () => {
    await ready();
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
  });

  it("sends only ids and quantities (never prices), shows pending, then success and empties the cart", async () => {
    const hold = gate();
    server.use(
      http.post("/api/orders", async ({ request }) => {
        orderCalls.push(await request.json());
        await hold.promise;
        return HttpResponse.json({ id: 501, table: 5, total: 110 }, { status: 201 });
      }),
    );
    const { user } = await ready();
    await add(user, "Idli");
    await add(user, "Dosa");
    await user.type(screen.getByLabelText("Table number"), " 5 ");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    const busy = screen.getByRole("button", { name: "Placing order..." });
    expect(busy).toBeDisabled();
    await user.click(busy); // a second click while pending must do nothing
    hold.open();

    expect(await screen.findByRole("status")).toHaveTextContent("Order #501 placed. Thank you, Asha Rao!");
    expect(orderCalls).toEqual([{ table: "5", lines: [{ id: 1, qty: 1 }, { id: 2, qty: 1 }] }]);
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("a rejected table shows the server's message as an alert tied to the field, and KEEPS the cart", async () => {
    const { user } = await ready();
    await add(user, "Idli");
    await user.type(screen.getByLabelText("Table number"), "13");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Table 13 is not available");
    const input = screen.getByLabelText("Table number");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Table 13/);
    expect(screen.getByText(/1 × Idli/)).toBeInTheDocument(); // nothing lost
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
  });

  it("the person can fix the table and try again", async () => {
    const { user } = await ready();
    await add(user, "Idli");
    await user.type(screen.getByLabelText("Table number"), "13");
    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("alert");
    await user.clear(screen.getByLabelText("Table number"));
    await user.type(screen.getByLabelText("Table number"), "4");
    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Order #501 placed");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a 422 for a bad table number is shown", async () => {
    const { user } = await ready();
    await add(user, "Idli");
    await user.type(screen.getByLabelText("Table number"), "99");
    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fix the form.");
  });

  it("a network failure is shown and the cart is kept", async () => {
    server.use(http.post("/api/orders", () => HttpResponse.error()));
    const { user } = await ready();
    await add(user, "Idli");
    await user.type(screen.getByLabelText("Table number"), "4");
    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(within(screen.getByRole("heading", { name: /Your cart/ }).parentElement).getByText(/1 × Idli/)).toBeInTheDocument();
  });
});
```

---

## 8. Results

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **48 passed** (6 files), stable over 3 runs |
| Build | `npm run build` | Built successfully |
| Break-it check 1 | `useFetch` did not abort in its cleanup | **1 test failed** (the late-answer test) |
| Break-it check 2 | `requestJSON` did not check `res.ok` | **13 tests failed** |
| Break-it check 3 | `useMutation` let any call update the state | **2 tests failed** |
| Break-it check 4 | Any `/me` error counted as signed out | **2 tests failed** |
| Break-it check 5 | The cart was cleared even when the order failed | **3 tests failed** |
| Break-it check 6 | The order also sent prices | **1 test failed** |
| Break-it check 7 | The error was not linked to the field (`aria-describedby`) | **1 test failed** |
| Break-it check 8 | Checkout had no loading branch | **1 test failed** (the "Please sign in" flash) |
| Break-it check 9 | The table value was not trimmed | **1 test failed** |
| Break-it check 10 | No maximum quantity in the cart | **1 test failed** |
| Break-it check 11 | `refetch` kept the old error on screen | **1 test failed** |
| Break-it check 12 | "Try again" did nothing | **1 test failed** |
| Break-it check 13 | `useUser` did not check for a provider | **1 test failed** |
| Break-it check 14 | The header had no loading text | **1 test failed** |
| Restored original | `npm test` | **48 passed** |

---

## 9. Problems avoided

| Problem | Cause | Fix |
|---|---|---|
| An "unmounted" check that did nothing | I first added a `mounted` flag to `useMutation` to avoid updating after unmount. Breaking it on purpose changed no test result | React 19 no longer warns about this, so the flag was dead code. I removed it and its test. The numbered-call check is what actually protects the screen |
| A 500 treated as data | `fetch` succeeds on a 500 | `requestJSON` checks `res.ok`. Removing the check fails 13 tests |
| Checkout flashing "Please sign in" | While `/me` loads there is no user yet | A `loading` branch shows "Checking your sign-in..." |
| A server crash looking like "signed out" | Both mean "no user" | Only a 401 means signed out. Anything else is `error` |
| Old answer overwriting a new one | A slow first request can finish after a fast second one | Abort in the effect cleanup, and a test that releases the old answer late |
| Lost cart after a refused table | Clearing the cart on any finish | The cart is cleared only in `onSuccess` |
| `useUser` test logging to the console | React logs a thrown render error, and the setup fails any `console.error` | That one test silences the log on purpose and still checks the thrown message |

---

## 10. What was practiced

- Handling loading, error and success for every request.
- Checking `res.ok`, because `fetch` does not throw on a 500.
- Cancelling requests with `AbortController` in an effect cleanup.
- Building a custom read hook and a custom change hook, and knowing why they are different.
- Sharing data with context instead of passing props down.
- Moving cart rules into a reducer.
- Testing real `fetch` calls with a fake server that can be held back or made to fail.
- Checking that tests are real by breaking the code on purpose.

---

## 11. Known limit

The menu, user and orders come from a fake server (`vite.config.js` for the browser, MSW for tests), not a real backend. The fake server always refuses table 13 and rejects tables outside 1 to 20 so errors can be seen. The user is always "Asha Rao" unless you open `/?guest=1`. There is no login screen; the task only asked for the user to be read from context. The task also allowed TanStack Query for the menu and `useActionState` for the order; this project uses the hand-built hooks (the first option for each). Orders are not stored anywhere after the response.

---

## 12. How to run it

```bash
cd kitchen-data-hooks
npm install
npm test        # 48 tests
npm run dev     # open the link
```

In the page: the menu shows `Loading the menu...` for about 0.7 seconds, then the dishes. Add some dishes, type a table number, press Place order (it says `Placing order...` for about a second). Use table `13` to see a refused order and `99` to see a validation error. Open `/?menu=fail` to see the menu error and Try again (it will fail again by design). Open `/?guest=1` to see the signed-out screens.

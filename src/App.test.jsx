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

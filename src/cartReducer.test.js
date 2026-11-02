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

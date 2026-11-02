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

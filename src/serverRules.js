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

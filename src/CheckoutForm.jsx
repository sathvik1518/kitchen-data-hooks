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

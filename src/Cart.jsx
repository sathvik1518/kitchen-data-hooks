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

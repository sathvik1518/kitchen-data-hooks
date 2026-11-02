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

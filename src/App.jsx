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

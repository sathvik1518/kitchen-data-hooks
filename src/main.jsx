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

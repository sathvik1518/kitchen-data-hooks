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

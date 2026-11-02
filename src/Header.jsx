import { useUser } from "./UserContext";

// Reads the user from context. It receives no props.
export default function Header() {
  const { status, user } = useUser();
  return (
    <header className="row">
      <h1>Kitchen</h1>
      <p aria-live="polite">
        {status === "loading" && "Signing in..."}
        {status === "signedIn" && <>Signed in as {user.name}</>}
        {status === "signedOut" && "You are not signed in."}
        {status === "error" && "Could not check your sign-in."}
      </p>
    </header>
  );
}

import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "./UserContext";
import { server, gate } from "./test/server";

// A deep child that reads the user. Nothing is passed to it.
function Deep() {
  const { status, user } = useUser();
  return <p>{status}:{user?.name ?? "-"}</p>;
}
const Wrapper = () => (
  <div><div><div><Deep /></div></div></div>
);

describe("UserProvider / useUser", () => {
  it("is 'loading' first, then 'signedIn' with the user, for a child many levels down", async () => {
    const hold = gate();
    server.use(http.get("/api/me", async () => (await hold.promise, HttpResponse.json({ id: 7, name: "Asha Rao" }))));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(screen.getByText("loading:-")).toBeInTheDocument();
    hold.open();
    expect(await screen.findByText("signedIn:Asha Rao")).toBeInTheDocument();
  });

  it("a 401 means 'signedOut'", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "no" }, { status: 401 })));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(await screen.findByText("signedOut:-")).toBeInTheDocument();
  });

  it("any other failure means 'error', which is NOT the same as signed out", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    render(<UserProvider><Wrapper /></UserProvider>);
    expect(await screen.findByText("error:-")).toBeInTheDocument();
  });

  it("useUser outside a provider throws a clear message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the thrown error
    expect(() => render(<Deep />)).toThrow(/inside a <UserProvider>/);
    spy.mockRestore();
  });
});

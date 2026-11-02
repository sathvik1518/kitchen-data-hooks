/** A failed request: `status` is the HTTP status, or 0 if no answer came at all. */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Sends a request and returns the parsed JSON.
 * `fetch` only fails on a network problem. A 404 or 500 is a "successful" fetch, so `res.ok` is checked.
 */
export async function requestJSON(url, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error; // cancelled on purpose: not a failure to report
    throw new ApiError("Could not reach the server.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body, or not JSON
  }
  if (!res.ok) throw new ApiError(typeof data?.detail === "string" ? data.detail : res.statusText || `HTTP ${res.status}`, res.status);
  return data;
}

export const placeOrder = (payload) => requestJSON("/api/orders", { method: "POST", body: payload });

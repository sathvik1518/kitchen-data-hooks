import { useCallback, useEffect, useState } from "react";
import { requestJSON } from "./api";

/**
 * Loads `url` and keeps three things: `data`, `error` and `loading`.
 *   - starts again when `url` changes
 *   - cancels the old request when the url changes or the screen goes away
 *   - `refetch()` loads again (for a "Try again" button)
 * `url` can be null: nothing is loaded (useful when you are not ready yet).
 */
export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: url !== null });
  const [attempt, setAttempt] = useState(0); // changing this makes the effect run again

  useEffect(() => {
    if (url === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, error: null, loading: true }));

    requestJSON(url, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name === "AbortError") return; // a newer request took over, or the screen is gone
        setState({ data: null, error, loading: false });
      });

    // The cleanup runs when `url` changes or the screen goes away. Aborting means an old
    // answer can never arrive late and overwrite a newer one.
    return () => controller.abort();
  }, [url, attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, refetch };
}

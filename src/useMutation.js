import { useCallback, useRef, useState } from "react";

/**
 * For things that CHANGE data (place an order). Unlike useFetch it does not run by itself:
 * it waits until you call `mutate(variables)`.
 *   status: "idle" | "pending" | "success" | "error"
 *   mutate(variables, { onSuccess, onError })   never throws; errors go to `error` and `onError`
 *   reset()                                     back to "idle"
 */
export function useMutation(mutationFn) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const latest = useRef(0); // numbers the calls, so only the newest one may update the state

  const mutate = useCallback(
    async (variables, { onSuccess, onError } = {}) => {
      const call = ++latest.current;
      setState({ status: "pending", data: null, error: null });
      try {
        const data = await mutationFn(variables);
        if (call === latest.current) setState({ status: "success", data, error: null });
        onSuccess?.(data);
      } catch (error) {
        if (call === latest.current) setState({ status: "error", data: null, error });
        onError?.(error);
      }
    },
    [mutationFn],
  );

  const reset = useCallback(() => {
    latest.current++;
    setState({ status: "idle", data: null, error: null });
  }, []);

  return { ...state, isPending: state.status === "pending", mutate, reset };
}

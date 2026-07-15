// Small client-side fetch wrapper for JSON mutations. Throws an Error with
// the server's message on non-2xx so callers can surface it in a toast.
export async function apiRequest<T = unknown>(
  path: string,
  options: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  const response = await fetch(path, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Something went wrong. Please try again.");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

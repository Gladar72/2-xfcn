/** Same-origin account actions surface the validation message returned by the service. */
export async function accountRequest<T>(url: string, method: "POST" | "PATCH", body: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.message || "Не удалось выполнить запрос. Попробуй ещё раз.");
  return result as T;
}

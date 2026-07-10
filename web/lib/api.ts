// Llamadas del cliente a las rutas /api/* con el ID token de Firebase.
import { idToken } from "./firebase";

export async function api<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  const token = await idToken();
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Algo salió mal. Intenta de nuevo.",
    );
  }
  return data as T;
}

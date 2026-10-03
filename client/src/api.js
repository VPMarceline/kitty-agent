const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

/**
 * Anonymous per-installation device identifier.
 * Persisted in localStorage; treated as a bearer secret by the server.
 */

const KEY = "csc.device_id.v1";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

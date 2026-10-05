/** Thin fetch client for the central room server (server/server.mjs). */
import type { CommunityRoom } from "../types/lobby";

const BASE = (import.meta.env.VITE_ROOMS_URL ?? "").replace(/\/+$/, "");

/** False until VITE_ROOMS_URL is set — the Community tab shows a setup hint then. */
export const isBackendConfigured = BASE.length > 0;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export interface CreatedRoom extends CommunityRoom {
  /** Server-issued secret, returned once at create time. Kept client-side. */
  hostSecret: string;
}

/** Pass clientId so the server un-hides the session key of your own locked rooms. */
export const apiListRooms = (clientId?: string): Promise<CommunityRoom[]> =>
  req(
    "GET",
    clientId ? `/rooms?clientId=${encodeURIComponent(clientId)}` : "/rooms",
  );

export const apiCreateRoom = (input: {
  roomName: string;
  description: string;
  sessionKey: string;
  isLocked: boolean;
  roomPasswordHash: string | null;
  hostClientId: string;
}): Promise<CreatedRoom> => req("POST", "/rooms", input);

export const apiPingRoom = (id: string, hostSecret: string): Promise<unknown> =>
  req("POST", `/rooms/${encodeURIComponent(id)}/ping`, { hostSecret });

/** Server-side PIN check; resolves with the session key, rejects on a mismatch. */
export const apiUnlockRoom = (id: string, password: string): Promise<string> =>
  req<{ sessionKey: string }>(
    "POST",
    `/rooms/${encodeURIComponent(id)}/unlock`,
    { password },
  ).then((r) => r.sessionKey);

// Secret in the body, not the URL — query strings end up in proxy access logs.
export const apiDeleteRoom = (id: string, hostSecret: string): Promise<unknown> =>
  req("DELETE", `/rooms/${encodeURIComponent(id)}`, { hostSecret });

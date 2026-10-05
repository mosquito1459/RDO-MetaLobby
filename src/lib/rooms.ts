/** Community room data access: polling subscription, hosting + heartbeat, unlock. */
import {
  apiCreateRoom,
  apiDeleteRoom,
  apiListRooms,
  apiPingRoom,
  apiUnlockRoom,
  isBackendConfigured,
} from "./backend";
import type { CommunityRoom, HostRoomInput } from "../types/lobby";

/** Stable per-session client id used to identify this host's own room. */
export const CLIENT_ID: string = crypto.randomUUID();

/** This client's active room broadcast. */
export interface Hosting {
  roomId: string;
  roomName: string;
}

export function randomSessionCode(prefix = "SOLO"): string {
  // Unambiguous characters only (no O/0, I/1 look-alikes).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number): string =>
    Array.from(
      { length: n },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `${prefix}-${pick(4)}-${pick(1)}`;
}

/** SHA-256 hex digest — room PINs are hashed client-side; plaintext never leaves the host machine. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Fired when this client's broadcast dies server-side (3 missed heartbeats ≈ the 90s TTL). */
type DeathListener = (message: string) => void;
let onHostDeath: DeathListener | null = null;

/** Register the UI callback for broadcast death; returns a deregister function. */
export function setHostDeathListener(fn: DeathListener | null): () => void {
  onHostDeath = fn;
  return () => {
    onHostDeath = null;
  };
}

/**
 * Room list via 5s polling of the central room server. Expiry is the server's
 * job (rooms unpinged for 90s are dropped before they're served), so the
 * client just renders what it gets — no local clock-skew concerns.
 * Returns an unsubscribe function.
 */
export function subscribeToRooms(
  onChange: (rooms: CommunityRoom[]) => void,
  onError?: (message: string) => void,
): () => void {
  if (!isBackendConfigured) {
    onError?.("Room server is not configured — set VITE_ROOMS_URL in .env");
    return () => {};
  }

  // Own clientId so the server un-hides the session key of our locked rooms.
  let stopped = false;
  const poll = (): void => {
    apiListRooms(CLIENT_ID)
      .then((list) => {
        if (!stopped) onChange(list);
      })
      .catch((e: unknown) => {
        if (!stopped) onError?.(e instanceof Error ? e.message : String(e));
      });
  };
  poll();
  const id = setInterval(poll, 5_000);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}

/** Active broadcasts: room id -> handle with the server-issued secret. */
interface HostingHandle {
  secret: string;
  timer: ReturnType<typeof setInterval>;
}
const hostingHandles = new Map<string, HostingHandle>();

let hostIntent = 0;

/** Create a room and keep it alive with a 30s heartbeat. Resolves once broadcasting. */
export async function hostRoom(
  input: HostRoomInput,
  onHosting: (hosting: Hosting | null, error?: string) => void,
): Promise<void> {
  if (!isBackendConfigured) {
    onHosting(null, "Room server is not configured");
    return;
  }

  // Only one broadcast at a time: stop and remove any already-hosted rooms,
  // otherwise their heartbeats keep ghost rooms online after the insert.
  for (const roomId of [...hostingHandles.keys()]) stopHosting(roomId, true);
  const intent = ++hostIntent;

  try {
    const created = await apiCreateRoom({
      roomName: input.roomName,
      description: input.description,
      sessionKey: input.sessionKey,
      isLocked: input.password != null,
      roomPasswordHash:
        input.password != null ? await sha256Hex(input.password) : null,
      hostClientId: CLIENT_ID,
    });

    // A newer hostRoom call started while this create was in flight (double
    // submit) — this room would be an invisible ghost, so delete it.
    if (intent !== hostIntent) {
      void apiDeleteRoom(created.id, created.hostSecret).catch(() => {});
      return;
    }

    // The secret is verified server-side on every ping/delete/unlock — the
    // client can never touch a room it didn't create.
    let misses = 0;
    const timer = setInterval(() => {
      void apiPingRoom(created.id, created.hostSecret)
        .then(() => {
          misses = 0;
        })
        .catch(() => {
          if (++misses < 3) return; // tolerate blips; 3 misses ≈ the server's 90s TTL
          stopHosting(created.id, false);
          onHostDeath?.(
            "Lost contact with the room server — your broadcast expired. Host again to restart it.",
          );
        });
    }, 30_000);
    hostingHandles.set(created.id, { secret: created.hostSecret, timer });

    onHosting({ roomId: created.id, roomName: created.roomName });
  } catch (e) {
    onHosting(null, e instanceof Error ? e.message : String(e));
  }
}

/** Stop heartbeating a room hosted by this client; optionally delete it remotely. */
export function stopHosting(roomId: string, deleteRow: boolean): void {
  const handle = hostingHandles.get(roomId);
  if (!handle) return;
  clearInterval(handle.timer);
  hostingHandles.delete(roomId);
  // Secret in the body, not the URL — query strings end up in proxy logs.
  if (deleteRow) void apiDeleteRoom(roomId, handle.secret).catch(() => {});
}

/** Verify a PIN server-side; resolves with the session key, rejects on a mismatch. */
export function unlockRoom(
  room: CommunityRoom,
  password: string,
): Promise<string> {
  return apiUnlockRoom(room.id, password);
}

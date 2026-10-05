/** Shared types across the app. Rust `LobbyStatus` serializes camelCase on the wire. */

export interface LobbyStatus {
  isPrivate: boolean;
  sessionCode: string | null;
}

/** Which startup.meta state the game dir is in (UI selection status). */
export type LobbyMode = "unknown" | "public" | "private";

/** Saved bookmark for quick one-click switching (localStorage). */
export interface Favorite {
  id: string;
  label: string;
  code: string;
}

/** A community room as surfaced to the UI (camelCase). */
export interface CommunityRoom {
  id: string;
  roomName: string;
  description: string;
  sessionKey: string;
  isLocked: boolean;
  /** SHA-256 hex of the room PIN; null for open rooms. */
  roomPasswordHash: string | null;
  hostClientId: string;
  /** ISO timestamp of the host's last heartbeat. */
  lastPing: string;
  createdAt: string;
}

/** Payload for hosting a new community room. Password hashed client-side. */
export interface HostRoomInput {
  roomName: string;
  description: string;
  sessionKey: string;
  password: string | null;
}

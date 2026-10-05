/** Community Rooms tab: realtime room list, join/unlock flow, own-room broadcasting. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  Copy,
  Dices,
  Ghost,
  Info,
  KeyRound,
  Lock,
  LockOpen,
  Radio,
  Square,
  X,
} from "lucide-react";
import {
  CLIENT_ID,
  hostRoom,
  randomSessionCode,
  setHostDeathListener,
  stopHosting,
  subscribeToRooms,
  unlockRoom,
} from "./lib/rooms";
import type { Hosting } from "./lib/rooms";
import { applyPrivateLobby } from "./lib/commands";
import { isBackendConfigured } from "./lib/backend";
import type { CommunityRoom } from "./types/lobby";

interface CommunityBrowserTabProps {
  gamePath: string | null;
  onApplied: () => void;
}

const inputCls =
  "bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-full";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-zinc-950";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-100";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Shared modal shell: backdrop click closes, panel click does not. */
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UnlockModal({
  room,
  gamePath,
  onApplied,
  onClose,
}: {
  room: CommunityRoom;
  gamePath: string | null;
  onApplied: () => void;
  onClose: () => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // Server-side PIN check — resolves with the session key, rejects on a
      // mismatch ("Wrong password." from the server's 401).
      const sessionKey = await unlockRoom(room, pw);
      if (!gamePath) {
        setError("Set your game path first.");
        return;
      }
      await applyPrivateLobby(gamePath, sessionKey);
      onApplied();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={room.roomName} onClose={onClose}>
      <div className="space-y-1">
        <label className="text-sm text-zinc-400">Password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.currentTarget.value)}
          className={`${inputCls} font-mono`}
          autoFocus
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => void submit()}
        >
          <KeyRound className="h-4 w-4" /> Unlock & Join
        </button>
      </div>
    </ModalShell>
  );
}

function HostModal({
  onHosting,
  onClose,
}: {
  onHosting: (h: Hosting) => void;
  onClose: () => void;
}) {
  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [sessionKey, setSessionKey] = useState(() => randomSessionCode("ROOM"));
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sanitizeKey = (v: string): string =>
    v.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();

  const submit = async (): Promise<void> => {
    if (!roomName.trim()) {
      setError("Room name is required.");
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(sessionKey)) {
      setError("Session key may only contain A-Z, 0-9, - and _.");
      return;
    }
    if (locked && !pin) {
      setError("PIN is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await hostRoom(
        {
          roomName: roomName.trim(),
          description: description.trim(),
          sessionKey,
          password: locked ? pin : null,
        },
        (h, err) => {
          if (err) {
            setError(err);
            setSubmitting(false);
          } else if (h) {
            onHosting(h);
          } else {
            setError("Failed to create room.");
            setSubmitting(false);
          }
        },
      );
    } catch (e) {
      setError(errMsg(e));
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Host a Room" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Room Name *</label>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.currentTarget.value)}
            className={inputCls}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Session Key</label>
          <div className="flex gap-2">
            <input
              value={sessionKey}
              onChange={(e) => setSessionKey(sanitizeKey(e.currentTarget.value))}
              maxLength={32}
              className={`${inputCls} font-mono flex-1`}
            />
            <button
              type="button"
              title="Generate new key"
              className="inline-flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-3 transition-colors"
              onClick={() => setSessionKey(randomSessionCode("ROOM"))}
            >
              <Dices className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Lock Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                !locked
                  ? "bg-zinc-800 text-zinc-100 border-amber-600"
                  : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-900"
              }`}
              onClick={() => setLocked(false)}
            >
              Open
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                locked
                  ? "bg-zinc-800 text-zinc-100 border-amber-600"
                  : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-900"
              }`}
              onClick={() => setLocked(true)}
            >
              Password Protected
            </button>
          </div>
        </div>
        {locked && (
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              maxLength={32}
              className={`${inputCls} font-mono`}
            />
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Creating…" : "Start Broadcasting"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export default function CommunityBrowserTab({
  gamePath,
  onApplied,
}: CommunityBrowserTabProps) {
  if (!isBackendConfigured) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-1">
        <div className="flex items-center gap-2 text-zinc-300">
          <Info className="h-4 w-4" />
          <span>Community directory is disabled.</span>
        </div>
        <p className="font-mono text-xs text-zinc-500">
          VITE_ROOMS_URL — see .env.example
        </p>
      </div>
    );
  }
  return <CommunityBrowserInner gamePath={gamePath} onApplied={onApplied} />;
}

function CommunityBrowserInner({
  gamePath,
  onApplied,
}: CommunityBrowserTabProps) {
  const [rooms, setRooms] = useState<CommunityRoom[]>([]);
  const [subError, setSubError] = useState<string | null>(null);
  const [hosting, setHosting] = useState<Hosting | null>(null);
  const [showHost, setShowHost] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<CommunityRoom | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const stop = subscribeToRooms(
      (list) => {
        setSubError(null); // a good poll clears a stale error banner
        setRooms(list);
      },
      setSubError,
    );
    return stop;
  }, []);

  // Broadcast death (3 missed heartbeats) drops the banner and re-enables hosting.
  useEffect(
    () =>
      setHostDeathListener((msg) => {
        setHosting(null);
        setSubError(msg);
      }),
    [],
  );

  const joinRoom = async (room: CommunityRoom): Promise<void> => {
    if (!gamePath) return;
    setJoiningId(room.id);
    setJoinError(null);
    try {
      await applyPrivateLobby(gamePath, room.sessionKey);
      onApplied();
      setSavedFlash(room.id);
    } catch (e) {
      setJoinError(errMsg(e));
    } finally {
      setJoiningId(null);
    }
  };

  const copyKey = (room: CommunityRoom): void => {
    navigator.clipboard
      .writeText(room.sessionKey)
      .then(() => {
        setCopiedId(room.id);
        setTimeout(() => setCopiedId(null), 1500);
      })
      .catch(() => setJoinError("Could not copy the session key."));
  };

  const pathHint = "Set your game path first.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-lg">Community Rooms</h2>
          <span className="text-zinc-500 text-sm">{rooms.length} online</span>
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={!gamePath || hosting !== null}
          title={!gamePath ? pathHint : "Stop broadcasting before hosting another room."}
          onClick={() => setShowHost(true)}
        >
          <Radio className="h-4 w-4" /> Host a Room
        </button>
      </div>

      {!gamePath && <p className="text-sm text-zinc-500">{pathHint}</p>}

      {hosting && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-zinc-300">
            Broadcasting <span className="font-medium">{hosting.roomName}</span>{" "}
            <span className="text-zinc-500">— heartbeat every 30s</span>
          </span>
          <button
            type="button"
            className={`${btnSecondary} ml-auto`}
            onClick={() => {
              stopHosting(hosting.roomId, true);
              setHosting(null);
            }}
          >
            <Square className="h-4 w-4" /> Stop
          </button>
        </div>
      )}

      {subError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {subError}
        </div>
      )}

      {joinError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {joinError}
        </div>
      )}

      {rooms.length === 0 && !subError ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col items-center gap-2 py-10 text-zinc-500">
          <Ghost className="h-8 w-8" />
          <p className="text-sm">No active rooms right now — host one!</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rooms.map((room) => {
            const ago = Math.max(
              0,
              Math.floor((Date.now() - Date.parse(room.lastPing)) / 1000),
            );
            const joinDisabled = joiningId !== null || !gamePath;
            return (
              <div
                key={room.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{room.roomName}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${
                      room.isLocked
                        ? "border-amber-500/40 text-amber-500"
                        : "border-emerald-500/40 text-emerald-500"
                    }`}
                  >
                    {room.isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <LockOpen className="h-4 w-4" />
                    )}
                    {room.isLocked ? "Locked" : "Open"}
                  </span>
                  {room.hostClientId === CLIENT_ID && (
                    <span className="inline-flex items-center text-xs text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">
                      Yours
                    </span>
                  )}
                </div>

                {room.description && (
                  <p className="text-sm text-zinc-400 line-clamp-2">
                    {room.description}
                  </p>
                )}

                {!room.isLocked || room.hostClientId === CLIENT_ID ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-amber-500">
                      {room.sessionKey}
                    </span>
                    <button
                      type="button"
                      title="Copy session key"
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
                      onClick={() => copyKey(room)}
                    >
                      {copiedId === room.id ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Session key is hidden until
                    unlocked.
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      pinged {ago}s ago
                    </span>
                    {savedFlash === room.id && (
                      <span className="text-emerald-400 text-xs">
                        Joined — restart RDR2.
                      </span>
                    )}
                  </div>
                  {room.isLocked ? (
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={joinDisabled}
                      title={!gamePath ? pathHint : undefined}
                      onClick={() => setUnlockTarget(room)}
                    >
                      <KeyRound className="h-4 w-4" /> Unlock & Join
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={joinDisabled}
                      title={!gamePath ? pathHint : undefined}
                      onClick={() => void joinRoom(room)}
                    >
                      Join
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showHost && (
        <HostModal
          onHosting={(h) => {
            setHosting(h);
            setShowHost(false);
          }}
          onClose={() => setShowHost(false)}
        />
      )}
      {unlockTarget && (
        <UnlockModal
          room={unlockTarget}
          gamePath={gamePath}
          onApplied={onApplied}
          onClose={() => setUnlockTarget(null)}
        />
      )}
    </div>
  );
}

/** Community Rooms tab: realtime room list, join/unlock flow, own-room broadcasting. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  Copy,
  Dices,
  Ghost,
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
  "w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/60";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 bg-amber-600 hover:bg-amber-500 text-zinc-950";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100";

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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="rise w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
        style={{ "--d": "0ms" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium tracking-tight text-zinc-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 transition-colors hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
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
      <div className="mt-4 space-y-1">
        <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Password
        </label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.currentTarget.value)}
          className={`${inputCls} font-mono tracking-wider`}
          autoFocus
        />
        {error && <p className="pt-1 text-xs text-red-400">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => void submit()}
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.8} /> Unlock & Join
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

  const modeBtn = (selected: boolean): string =>
    `flex-1 rounded-lg border px-3 py-2 text-sm transition-all active:scale-[0.98] ${
      selected
        ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
        : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
    }`;

  return (
    <ModalShell title="Host a Room" onClose={onClose}>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Room Name
          </label>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.currentTarget.value)}
            className={inputCls}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            className={`${inputCls} resize-none`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Session Key
          </label>
          <div className="flex gap-2">
            <input
              value={sessionKey}
              onChange={(e) => setSessionKey(sanitizeKey(e.currentTarget.value))}
              maxLength={32}
              className={`${inputCls} flex-1 font-mono tracking-wider`}
            />
            <button
              type="button"
              title="Generate new key"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-300 transition-all hover:border-zinc-700 hover:text-zinc-100 active:scale-[0.98]"
              onClick={() => setSessionKey(randomSessionCode("ROOM"))}
            >
              <Dices className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Access
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={modeBtn(!locked)}
              onClick={() => setLocked(false)}
            >
              Open
            </button>
            <button
              type="button"
              className={modeBtn(locked)}
              onClick={() => setLocked(true)}
            >
              Password Protected
            </button>
          </div>
        </div>
        {locked && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              PIN
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              maxLength={32}
              className={`${inputCls} font-mono tracking-wider`}
            />
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Broadcasting…" : "Start Broadcasting"}
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
      <div className="rise pt-8">
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center">
          <p className="text-sm text-zinc-400">Community directory is disabled.</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-600">
            VITE_ROOMS_URL — see .env.example
          </p>
        </div>
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
    <div className="rise pt-8" style={{ "--d": "100ms" } as React.CSSProperties}>
      {/* Page head: title + live count + host action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-light tracking-tight text-zinc-100">
            Community Rooms
          </h2>
          <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {rooms.length} online
          </span>
        </div>
        <button type="button" className={btnPrimary} disabled={!gamePath || hosting !== null} title={!gamePath ? pathHint : "Stop broadcasting before hosting another room."} onClick={() => setShowHost(true)}>
          <Radio className="h-4 w-4" strokeWidth={1.8} /> Host a Room
        </button>
      </div>

      {/* Live broadcasting bar — a status pill, not another card */}
      {hosting && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="text-sm text-zinc-300">
            Broadcasting <span className="font-medium text-zinc-100">{hosting.roomName}</span>
          </span>
          <span className="font-mono text-[11px] text-zinc-600">heartbeat 30s</span>
          <button
            type="button"
            className={`${btnSecondary} ml-auto py-1.5!`}
            onClick={() => {
              stopHosting(hosting.roomId, true);
              setHosting(null);
            }}
          >
            <Square className="h-3.5 w-3.5" strokeWidth={1.8} /> Stop
          </button>
        </div>
      )}

      {subError && (
        <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          {subError}
        </div>
      )}

      {joinError && (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          {joinError}
        </div>
      )}

      {/* Directory */}
      {rooms.length === 0 && !subError ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 py-16 text-zinc-600">
          <Ghost className="h-7 w-7" strokeWidth={1.5} />
          <p className="text-sm">No active rooms right now — host one.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {rooms.map((room, i) => {
            const ago = Math.max(
              0,
              Math.floor((Date.now() - Date.parse(room.lastPing)) / 1000),
            );
            const own = room.hostClientId === CLIENT_ID;
            const joinDisabled = joiningId !== null || !gamePath;
            return (
              <article
                key={room.id}
                className="group rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-5 transition-all hover:border-zinc-700/70 hover:bg-zinc-900/60"
                style={{ "--d": `${160 + i * 60}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium tracking-tight text-zinc-100">
                    {room.roomName}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                      room.isLocked
                        ? "border-amber-500/30 text-amber-500"
                        : "border-emerald-500/30 text-emerald-500"
                    }`}
                  >
                    {room.isLocked ? (
                      <Lock className="h-3 w-3" strokeWidth={2} />
                    ) : (
                      <LockOpen className="h-3 w-3" strokeWidth={2} />
                    )}
                    {room.isLocked ? "Locked" : "Open"}
                  </span>
                  {own && (
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                      Yours
                    </span>
                  )}
                </div>

                {room.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                    {room.description}
                  </p>
                )}

                {/* Key row: shown unlocked or to the owner; hidden from strangers on locked rooms */}
                {!room.isLocked || own ? (
                  <button
                    type="button"
                    onClick={() => copyKey(room)}
                    title="Copy session key"
                    className="mt-3 flex items-center gap-2 font-mono text-sm tracking-wider text-amber-500 transition-colors hover:text-amber-400"
                  >
                    {room.sessionKey}
                    {copiedId === room.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} />
                    ) : (
                      <Copy className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.8} />
                    )}
                  </button>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-zinc-600">
                    <Lock className="h-3 w-3" strokeWidth={2} /> key hidden until unlocked
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-3">
                  <span className="font-mono text-[11px] text-zinc-600">
                    pinged {ago}s ago
                    {savedFlash === room.id && (
                      <span className="ml-2 text-emerald-500">joined — restart RDR2</span>
                    )}
                  </span>
                  {room.isLocked ? (
                    <button
                      type="button"
                      className={`${btnSecondary} py-1.5! text-[13px]!`}
                      disabled={joinDisabled}
                      title={!gamePath ? pathHint : undefined}
                      onClick={() => setUnlockTarget(room)}
                    >
                      <KeyRound className="h-3.5 w-3.5" strokeWidth={1.8} /> Unlock & Join
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${btnPrimary} py-1.5! text-[13px]!`}
                      disabled={joinDisabled}
                      title={!gamePath ? pathHint : undefined}
                      onClick={() => void joinRoom(room)}
                    >
                      Join
                    </button>
                  )}
                </div>
              </article>
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

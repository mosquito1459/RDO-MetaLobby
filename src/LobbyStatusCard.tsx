import { useEffect, useRef, useState } from "react";
import { Check, Copy, FolderSearch, Lock, ShieldOff } from "lucide-react";
import type { LobbyStatus } from "./types/lobby";

interface Props {
  gamePath: string | null;
  status: LobbyStatus | null;
  statusError?: string | null;
}

/** Session hero: state on the left, live session code on the right. Unboxed — separated by hairlines. */
export default function LobbyStatusCard({
  gamePath,
  status,
  statusError,
}: Props) {
  // "ok" = copied (Check), "fail" = clipboard rejected; auto-clears after 1.5s
  const [feedback, setFeedback] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  async function copyCode(code: string) {
    clearTimer();
    try {
      await navigator.clipboard.writeText(code);
      setFeedback("ok");
    } catch {
      setFeedback("fail");
    }
    timer.current = window.setTimeout(() => setFeedback(null), 1500);
  }

  const isPrivate = status?.isPrivate === true;
  const code = status?.sessionCode ?? null;

  return (
    <section className="border-b border-zinc-800/70 pb-8 pt-2">
      <div className="rise flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        {/* Left: what the game will boot into */}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            Active Session
          </p>

          {gamePath === null ? (
            <p className="mt-3 text-zinc-400">Configure your game path to begin.</p>
          ) : status === null ? (
            <div className="mt-4 space-y-2">
              <div className="skeleton h-6 w-44" />
              <div className="skeleton h-4 w-64" />
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              {isPrivate ? (
                <Lock className="h-5 w-5 text-amber-500" strokeWidth={1.8} />
              ) : (
                <ShieldOff className="h-5 w-5 text-zinc-500" strokeWidth={1.8} />
              )}
              <h2 className="text-3xl font-light tracking-tight text-zinc-100">
                {isPrivate ? "Private Lobby" : "Public Lobby"}
              </h2>
            </div>
          )}

          {status !== null && (
            <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-zinc-500">
              {isPrivate
                ? "startup.meta is in place — the game boots straight into this session key."
                : "Vanilla Rockstar matchmaking — startup.meta removed."}
            </p>
          )}

          {statusError != null && (
            <p className="mt-3 text-sm text-red-400">
              Failed to read lobby status: {statusError}
            </p>
          )}
        </div>

        {/* Right: the live code (or call-to-action when unconfigured) */}
        <div className="rise shrink-0" style={{ "--d": "120ms" } as React.CSSProperties}>
          {gamePath === null ? (
            <p className="flex items-center gap-2 font-mono text-xs text-zinc-600">
              <FolderSearch className="h-3.5 w-3.5" /> waiting for game path
            </p>
          ) : status === null ? (
            <div className="skeleton h-14 w-56" />
          ) : isPrivate ? (
            <div className="flex flex-col items-start gap-1.5">
              {code === null ? (
                <span className="font-mono text-sm text-zinc-600">(unknown key)</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void copyCode(code)}
                    title="Copy session code"
                    className="group flex items-baseline gap-3 font-mono text-4xl font-medium tracking-[0.18em] text-amber-500 transition-all hover:text-amber-400 active:scale-[0.98]"
                  >
                    {code}
                    {feedback === "ok" ? (
                      <Check className="h-4 w-4 self-center text-emerald-500" strokeWidth={2} />
                    ) : (
                      <Copy
                        className="h-4 w-4 self-center opacity-0 transition-opacity group-hover:opacity-100"
                        strokeWidth={1.8}
                      />
                    )}
                  </button>
                  {feedback === "fail" && (
                    <span className="text-xs text-red-400">Copy failed</span>
                  )}
                  <span className="font-mono text-[11px] text-zinc-600">
                    {gamePath}/x64/data — restart to apply
                  </span>
                </>
              )}
            </div>
          ) : (
            <p className="font-mono text-xs text-zinc-600">
              no session key — matchmaking decides
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Lock, Settings, ShieldCheck } from "lucide-react";
import type { LobbyStatus } from "./types/lobby";

interface Props {
  gamePath: string | null;
  status: LobbyStatus | null;
  statusError?: string | null;
}

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

  let content: ReactNode;
  if (gamePath === null) {
    content = (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Settings className="h-4 w-4" />
        <span>Configure your game path to begin.</span>
      </div>
    );
  } else if (status === null) {
    content = <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />;
  } else if (status.isPrivate) {
    const code = status.sessionCode;
    content = (
      <div className="flex items-start gap-3">
        <Lock className="h-8 w-8 text-amber-500" />
        <div>
          <p className="text-lg font-semibold">Private Lobby Active</p>
          <div className="mt-2 flex items-center gap-2">
            {code === null ? (
              <span className="text-sm text-zinc-500">(unknown key)</span>
            ) : (
              <>
                <span className="rounded border border-amber-600 bg-zinc-950 px-2 py-1 font-mono text-lg tracking-wider text-amber-500">
                  {code}
                </span>
                <button
                  type="button"
                  onClick={() => void copyCode(code)}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
                >
                  {feedback === "ok" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copy
                </button>
                {feedback === "fail" && (
                  <span className="text-xs text-red-400">Copy failed</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-8 w-8 text-emerald-500" />
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold">Public Lobby Active</p>
            <span className="rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-500">
              PUBLIC
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Vanilla Rockstar matchmaking — startup.meta removed.
          </p>
        </div>
      </div>
    );
  }

  const active = gamePath !== null && status !== null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500">
        Active Session
      </h2>
      <div className="mt-4">{content}</div>
      {statusError && (
        <p className="mt-3 text-sm text-red-400">
          Failed to read lobby status: {statusError}
        </p>
      )}
      {active && (
        <p className="mt-3 font-mono text-xs text-zinc-500">
          startup.meta — {gamePath}/x64/data
        </p>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Globe, Zap } from "lucide-react";
import Header from "./Header";
import LobbyStatusCard from "./LobbyStatusCard";
import QuickSwitcherTab from "./QuickSwitcherTab";
import CommunityBrowserTab from "./CommunityBrowserTab";
import {
  browseFolder,
  checkLobbyStatus,
  detectGamePath,
  isGameRunning,
} from "./lib/commands";
import type { LobbyStatus } from "./types/lobby";

const STORAGE_KEY = "rdo.metalobby.gamePath";

const NAV = [
  { id: "quick", label: "Quick Switcher", icon: Zap },
  { id: "community", label: "Community Rooms", icon: Globe },
] as const;

type TabId = (typeof NAV)[number]["id"];

/** Desktop shell: fixed left rail (identity, nav, game-path status) + main column. */
function App() {
  const [gamePath, setGamePath] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<LobbyStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("quick");

  // Best-effort auto-detection while unconfigured.
  useEffect(() => {
    if (gamePath != null) return;
    detectGamePath()
      .then((path) => {
        if (path != null) setGamePath(path);
      })
      .catch(() => {
        // leave unconfigured; user can Browse
      });
  }, [gamePath]);

  const refresh = useCallback((): void => {
    if (gamePath == null) {
      setStatus(null);
      setStatusError(null);
      return;
    }
    checkLobbyStatus(gamePath)
      .then((s) => {
        setStatus(s);
        setStatusError(null);
      })
      .catch((e: unknown) => {
        setStatus(null);
        setStatusError(e instanceof Error ? e.message : String(e));
      });
  }, [gamePath]);

  // Persist the path and re-check startup.meta state whenever it changes.
  useEffect(() => {
    try {
      if (gamePath == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, gamePath);
    } catch {
      // storage unavailable — path just won't persist
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const poll = (): void => {
      isGameRunning()
        .then((running) => {
          if (alive) setGameRunning(running);
        })
        .catch(() => {
          // keep previous value on failure
        });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const onBrowse = useCallback((): void => {
    setBrowseError(null);
    browseFolder()
      .then((path) => {
        if (path != null) setGamePath(path);
      })
      .catch((e: unknown) => {
        setBrowseError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  return (
    <div className="flex min-h-[100dvh]">
      {/* ── Left rail ─────────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-[100dvh] w-60 shrink-0 flex-col border-r border-zinc-800/70 bg-zinc-900/40 px-4 py-6">
        <div className="rise px-2">
          <p className="text-[10px] font-light uppercase tracking-[0.35em] text-amber-500/90">
            Red Dead
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-100">
            MetaLobby
          </h1>
        </div>

        <nav className="mt-10 space-y-1">
          {NAV.map((item, i) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rise group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                  active
                    ? "bg-zinc-800/80 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300"
                }`}
                style={{ "--d": `${120 + i * 70}ms` } as React.CSSProperties}
              >
                {/* active rail tick */}
                <span
                  className={`absolute -left-4 h-5 w-[3px] rounded-full transition-colors ${
                    active ? "bg-amber-500" : "bg-transparent"
                  }`}
                />
                <item.icon className="h-4 w-4" strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Game-path status — the app's wired-or-wired state, pinned bottom. */}
        <div className="rise mt-auto" style={{ "--d": "260ms" } as React.CSSProperties}>
          <button
            type="button"
            onClick={onBrowse}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-left transition-colors hover:border-zinc-700 active:scale-[0.98]"
            title={gamePath ?? "Choose the folder containing RDR2.exe"}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  gamePath != null ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {gamePath != null ? "Game path set" : "Game path missing"}
            </span>
            <span className="mt-1 block truncate font-mono text-[11px] text-zinc-600">
              {gamePath ?? "Browse to configure"}
            </span>
          </button>
          {browseError != null && (
            <p className="mt-2 px-1 text-xs text-red-400">{browseError}</p>
          )}
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1400px] px-10 py-8">
          <Header gameRunning={gameRunning} />

          <LobbyStatusCard
            gamePath={gamePath}
            status={status}
            statusError={statusError}
          />

          {/* Both panels stay mounted so realtime subscriptions and hosting state survive tab switches. */}
          <div className={tab === "quick" ? "" : "hidden"}>
            <QuickSwitcherTab gamePath={gamePath} status={status} onApplied={refresh} />
          </div>
          <div className={tab === "community" ? "" : "hidden"}>
            <CommunityBrowserTab gamePath={gamePath} onApplied={refresh} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

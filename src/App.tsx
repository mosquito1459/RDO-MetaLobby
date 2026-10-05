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
  const [tab, setTab] = useState<"quick" | "community">("quick");

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
    <>
      <Header
        gamePath={gamePath}
        gameRunning={gameRunning}
        browseError={browseError}
        onBrowse={onBrowse}
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <LobbyStatusCard
          gamePath={gamePath}
          status={status}
          statusError={statusError}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("quick")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "quick"
                ? "bg-amber-600 text-zinc-950"
                : "border border-zinc-800 bg-zinc-900 text-zinc-300"
            }`}
          >
            <Zap className="h-4 w-4" />
            Quick Switcher
          </button>
          <button
            type="button"
            onClick={() => setTab("community")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "community"
                ? "bg-amber-600 text-zinc-950"
                : "border border-zinc-800 bg-zinc-900 text-zinc-300"
            }`}
          >
            <Globe className="h-4 w-4" />
            Community Browser
          </button>
        </div>

        {/* Both panels stay mounted so realtime subscriptions and hosting state survive tab switches. */}
        <div className={tab === "quick" ? "" : "hidden"}>
          <QuickSwitcherTab gamePath={gamePath} status={status} onApplied={refresh} />
        </div>
        <div className={tab === "community" ? "" : "hidden"}>
          <CommunityBrowserTab gamePath={gamePath} onApplied={refresh} />
        </div>
      </main>
    </>
  );
}

export default App;

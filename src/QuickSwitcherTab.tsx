/** Quick one-click lobby switching: public, solo, direct code, saved favorites. */
import { useState } from "react";
import { Globe, User, LogIn, Bookmark, BookmarkPlus, Trash2, ArrowRight } from "lucide-react";
import type { Favorite, LobbyStatus } from "./types/lobby";
import { applyPublicLobby, applyPrivateLobby } from "./lib/commands";
import { randomSessionCode } from "./lib/rooms";
import { loadFavorites, saveFavorites } from "./lib/favorites";

interface QuickSwitcherTabProps {
  gamePath: string | null;
  status: LobbyStatus | null;
  onApplied: () => void;
}

const CODE_RE = /^[A-Z0-9_-]+$/;
const sanitizeCode = (v: string): string =>
  v.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();

export default function QuickSwitcherTab({
  gamePath,
  status,
  onApplied,
}: QuickSwitcherTabProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [directCode, setDirectCode] = useState("");
  const [favLabel, setFavLabel] = useState("");
  const [favCode, setFavCode] = useState("");
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites);

  const disabled = busy !== null || !gamePath;

  async function apply(actionId: string, code: string | null): Promise<void> {
    if (!gamePath) return;
    setBusy(actionId);
    setError(null);
    setSuccess(null);
    try {
      if (code === null) {
        await applyPublicLobby(gamePath);
        setSuccess("Switched to Rockstar public matchmaking.");
      } else {
        await applyPrivateLobby(gamePath, code);
        setSuccess(`Applied ${code} — restart RDR2 for it to take effect.`);
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function removeFavorite(id: string): void {
    const rest = favorites.filter((f) => f.id !== id);
    saveFavorites(rest);
    setFavorites(rest);
  }

  function addFavorite(): void {
    const label = favLabel.trim();
    if (label === "" || !CODE_RE.test(favCode)) return;
    const next = [
      ...favorites,
      { id: crypto.randomUUID(), label, code: favCode },
    ];
    saveFavorites(next);
    setFavorites(next);
    setFavLabel("");
    setFavCode("");
  }

  const directValid = CODE_RE.test(directCode);
  const favCodeInvalid = favCode.length > 0 && !CODE_RE.test(favCode);

  return (
    <div className="pt-8">
      {/* Alerts */}
      <div className="rise space-y-3" style={{ "--d": "180ms" } as React.CSSProperties}>
        {success && (
          <p className="text-sm text-emerald-500">{success}</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!gamePath && (
          <p className="text-sm text-zinc-500">Set your game path first.</p>
        )}
      </div>

      {/* Primary switch targets — two large asymmetric tiles */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void apply("public", null)}
          disabled={disabled}
          className="rise group flex flex-col items-start gap-8 rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-6 text-left transition-all hover:border-emerald-500/40 hover:bg-zinc-900/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:mt-6"
          style={{ "--d": "240ms" } as React.CSSProperties}
        >
          <Globe className="h-5 w-5 text-emerald-500" strokeWidth={1.8} />
          <div>
            <p className="text-lg font-medium tracking-tight text-zinc-100">Go Public</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              Remove startup.meta and return to Rockstar matchmaking.
            </p>
          </div>
          <span className="mt-auto font-mono text-xs text-zinc-600 transition-colors group-hover:text-emerald-500">
            {busy === "public" ? "switching…" : "switch →"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void apply("solo", randomSessionCode("SOLO"))}
          disabled={disabled}
          className="rise group flex flex-col items-start gap-8 rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-6 text-left transition-all hover:border-amber-500/40 hover:bg-zinc-900/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ "--d": "300ms" } as React.CSSProperties}
        >
          <User className="h-5 w-5 text-amber-500" strokeWidth={1.8} />
          <div>
            <p className="text-lg font-medium tracking-tight text-zinc-100">Solo Session</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              Generate a random key and boot into your own private lobby.
            </p>
          </div>
          <span className="mt-auto font-mono text-xs text-zinc-600 transition-colors group-hover:text-amber-400">
            {busy === "solo" ? "generating…" : "generate →"}
          </span>
        </button>
      </div>

      {/* Join by code + library — asymmetric 2fr/1fr split */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr,1fr]">
        {/* Direct code */}
        <div
          className="rise rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-6 transition-colors hover:border-zinc-700/70"
          style={{ "--d": "360ms" } as React.CSSProperties}
        >
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
            <h3 className="text-sm font-medium text-zinc-100">Join a Friend</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Enter their session key — the game boots straight into it.
          </p>
          {status?.sessionCode && (
            <p className="mt-3 font-mono text-[11px] text-zinc-600">
              active: <span className="text-amber-500">{status.sessionCode}</span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={directCode}
              onChange={(e) => setDirectCode(sanitizeCode(e.target.value))}
              placeholder="FRIENDS-CODE-1"
              maxLength={32}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 font-mono text-sm tracking-wider text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            <button
              type="button"
              onClick={() => void apply("direct", directCode)}
              disabled={disabled || directCode === "" || !directValid}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-zinc-950 transition-all hover:bg-amber-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "direct" ? "joining…" : <ArrowRight className="h-4 w-4" strokeWidth={2} />}
            </button>
          </div>
          {directCode.length > 0 && !directValid && (
            <p className="mt-2 text-xs text-red-400">
              A-Z, 0-9, hyphens and underscores only.
            </p>
          )}
        </div>

        {/* Favorites */}
        <div
          className="rise rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-6 transition-colors hover:border-zinc-700/70"
          style={{ "--d": "420ms" } as React.CSSProperties}
        >
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
            <h3 className="text-sm font-medium text-zinc-100">Saved Lobbies</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            One-click codes you use often.
          </p>

          {favorites.length === 0 ? (
            <p className="mt-4 border border-dashed border-zinc-800 rounded-lg px-4 py-6 text-center text-xs leading-relaxed text-zinc-600">
              Nothing saved yet — add a code below.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/60 mt-2">
              {favorites.map((fav) => (
                <li key={fav.id} className="flex items-center gap-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => void apply(fav.id, fav.code)}
                    disabled={disabled}
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800/50 active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="block truncate text-sm text-zinc-200">{fav.label}</span>
                    <span className="block font-mono text-[11px] text-amber-500">{fav.code}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFavorite(fav.id)}
                    disabled={busy !== null}
                    aria-label={`Remove ${fav.label}`}
                    className="rounded p-2 text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={favLabel}
              onChange={(e) => setFavLabel(e.target.value)}
              placeholder="Label"
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            <input
              type="text"
              value={favCode}
              onChange={(e) => setFavCode(sanitizeCode(e.target.value))}
              placeholder="CODE"
              maxLength={32}
              className="w-28 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            <button
              type="button"
              onClick={addFavorite}
              disabled={favLabel.trim() === "" || !CODE_RE.test(favCode)}
              className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-300 transition-all hover:border-zinc-700 hover:text-zinc-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <BookmarkPlus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          {favCodeInvalid && (
            <p className="mt-2 text-xs text-red-400">
              A-Z, 0-9, hyphens and underscores only.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

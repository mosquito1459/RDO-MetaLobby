/** Quick one-click lobby switching: public, solo, direct code, saved favorites. */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Globe,
  User,
  LogIn,
  Bookmark,
  BookmarkPlus,
  Trash2,
} from "lucide-react";
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

function Card({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

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
    <div className="space-y-4">
      {success && <p className="text-emerald-400 text-sm">{success}</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!gamePath && <p className="text-red-400 text-sm">Set your game path first.</p>}

      <Card
        icon={<Globe className="h-4 w-4 text-emerald-500" />}
        title="Go Public"
        description="Remove startup.meta and return to Rockstar public matchmaking."
      >
        <button
          type="button"
          onClick={() => void apply("public", null)}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-zinc-950"
        >
          <Globe className="h-4 w-4" />
          {busy === "public" ? "Switching..." : "Go Public"}
        </button>
      </Card>

      <Card
        icon={<User className="h-4 w-4 text-amber-500" />}
        title="Solo Session"
        description="Generate a random session key and enter a private solo lobby."
      >
        <button
          type="button"
          onClick={() => void apply("solo", randomSessionCode("SOLO"))}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-zinc-950"
        >
          <User className="h-4 w-4" />
          {busy === "solo" ? "Generating..." : "Generate Solo Lobby"}
        </button>
      </Card>

      <Card
        icon={<LogIn className="h-4 w-4 text-amber-500" />}
        title="Direct Code"
        description="Join a friend's private lobby with their session key."
      >
        {status?.sessionCode && (
          <p className="mb-2 font-mono text-xs text-zinc-400">
            Active: <span className="text-amber-500">{status.sessionCode}</span>
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={directCode}
            onChange={(e) => setDirectCode(sanitizeCode(e.target.value))}
            placeholder="FRIENDS-CODE-1"
            maxLength={32}
            className="font-mono bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
          />
          <button
            type="button"
            onClick={() => void apply("direct", directCode)}
            disabled={disabled || directCode === "" || !directValid}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-zinc-950"
          >
            <LogIn className="h-4 w-4" />
            {busy === "direct" ? "Joining..." : "Join"}
          </button>
        </div>
        {directCode.length > 0 && !directValid && (
          <p className="mt-2 text-red-400 text-sm">
            Use A-Z, 0-9, hyphens and underscores only.
          </p>
        )}
      </Card>

      <Card
        icon={<Bookmark className="h-4 w-4 text-amber-500" />}
        title="Saved Favorites"
        description="One-click switching to lobbies you saved earlier."
      >
        {favorites.length === 0 ? (
          <p className="text-sm text-zinc-400">No saved lobbies yet.</p>
        ) : (
          <ul className="space-y-2">
            {favorites.map((fav) => (
              <li key={fav.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void apply(fav.id, fav.code)}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                >
                  {fav.label}
                  <span className="font-mono text-amber-500">{fav.code}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeFavorite(fav.id)}
                  disabled={busy !== null}
                  aria-label={`Remove ${fav.label}`}
                  className="inline-flex items-center rounded-md p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
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
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
          />
          <input
            type="text"
            value={favCode}
            onChange={(e) => setFavCode(sanitizeCode(e.target.value))}
            placeholder="CODE"
            maxLength={32}
            className="font-mono bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
          />
          <button
            type="button"
            onClick={addFavorite}
            disabled={favLabel.trim() === "" || !CODE_RE.test(favCode)}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
          >
            <BookmarkPlus className="h-4 w-4" />
            Save
          </button>
        </div>
        {favCodeInvalid && (
          <p className="mt-2 text-red-400 text-sm">
            Use A-Z, 0-9, hyphens and underscores only.
          </p>
        )}
      </Card>
    </div>
  );
}

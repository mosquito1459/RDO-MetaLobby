import { AlertTriangle, FolderOpen } from "lucide-react";

interface HeaderProps {
  gamePath: string | null;
  gameRunning: boolean;
  browseError: string | null;
  onBrowse: () => void;
}

export default function Header({
  gamePath,
  gameRunning,
  browseError,
  onBrowse,
}: HeaderProps) {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <FolderOpen className="h-4 w-4 shrink-0 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-100">Game Path</span>
        {gamePath != null ? (
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-300"
            title={gamePath}
          >
            {gamePath}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
            Not configured
          </span>
        )}
        {gamePath != null ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Valid Path
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Path Not Configured
          </span>
        )}
        <button
          type="button"
          onClick={onBrowse}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
        >
          Browse
        </button>
      </div>

      {browseError != null && (
        <div className="px-4 pb-2 text-sm text-red-400">{browseError}</div>
      )}

      {gameRunning && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-zinc-100">
            <span className="font-bold">RDR2 is currently running.</span> You
            must restart the game for lobby changes to take effect.
          </span>
        </div>
      )}
    </>
  );
}

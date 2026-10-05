import { AlertTriangle } from "lucide-react";

interface HeaderProps {
  gameRunning: boolean;
}

/** Top strip of the main column: page context plus the game-running banner. */
export default function Header({ gameRunning }: HeaderProps) {
  return (
    <>
      {gameRunning && (
        <div className="rise mb-6 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.8} />
          <span className="text-zinc-300">
            <span className="font-semibold text-amber-400">RDR2 is running.</span>{" "}
            Restart the game for lobby changes to take effect.
          </span>
        </div>
      )}
    </>
  );
}

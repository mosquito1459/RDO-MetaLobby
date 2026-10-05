/** Typed wrappers over Tauri commands (src-tauri/src/lib.rs). Argument keys are camelCase. */
import { invoke } from "@tauri-apps/api/core";
import type { LobbyStatus } from "../types/lobby";

export const detectGamePath = (): Promise<string | null> =>
  invoke<string | null>("detect_game_path");

export const browseFolder = (): Promise<string | null> =>
  invoke<string | null>("browse_folder");

export const checkLobbyStatus = (gamePath: string): Promise<LobbyStatus> =>
  invoke<LobbyStatus>("check_lobby_status", { gamePath });

export const applyPublicLobby = (gamePath: string): Promise<void> =>
  invoke<void>("apply_public_lobby", { gamePath });

export const applyPrivateLobby = (
  gamePath: string,
  sessionCode: string,
): Promise<void> =>
  invoke<void>("apply_private_lobby", { gamePath, sessionCode });

export const isGameRunning = (): Promise<boolean> =>
  invoke<boolean>("is_game_running");

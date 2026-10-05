/** Saved lobby-code bookmarks persisted in localStorage. */
import type { Favorite } from "../types/lobby";

const KEY = "rdo.metalobby.favorites";

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Favorite[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: Favorite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites));
  } catch {
    // Storage unavailable (e.g. cleared site data) — favorites just won't persist.
  }
}

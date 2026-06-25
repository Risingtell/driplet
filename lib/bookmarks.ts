/**
 * Saved creators — a no-account "follow" kept in the viewer's browser
 * (localStorage). Lets a viewer save a creator and come back to re-watch,
 * without any signup. Keeps the zero-friction viewer model intact.
 */
export interface Bookmark {
  address: string;
  name: string;
}

const KEY = "driplet:saved-creators";

export function getBookmarks(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isBookmarked(address: string): boolean {
  return getBookmarks().some((b) => b.address.toLowerCase() === address.toLowerCase());
}

/** Toggle a saved creator; returns the new saved state. */
export function toggleBookmark(b: Bookmark): boolean {
  const list = getBookmarks();
  const i = list.findIndex((x) => x.address.toLowerCase() === b.address.toLowerCase());
  if (i >= 0) {
    localStorage.setItem(KEY, JSON.stringify(list.filter((_, j) => j !== i)));
    return false;
  }
  localStorage.setItem(KEY, JSON.stringify([...list, b]));
  return true;
}

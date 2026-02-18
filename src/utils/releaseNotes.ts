/**
 * Release notes - loaded from public/release-notes.json.
 * Entries are in commit order (oldest first). Version = array index.
 * lastSeenRelease is stored per-user in DB (users.verified).
 */

export interface ReleaseNote {
  message: string;
}

const RELEASE_NOTES_URL = '/release-notes.json';
const LAST_PLAYED_VERSION_KEY = 'polywordlot-last-played-version';
const INDEX_PREFIX = 'i';

function toIndexKey(index: number): string {
  return INDEX_PREFIX + index;
}

/**
 * Fetches release notes from the JSON file.
 * @param bustCache - if true, appends timestamp to bypass cache and get fresh server content
 */
export async function loadReleaseNotes(bustCache = false): Promise<ReleaseNote[]> {
  try {
    const url = bustCache ? `${RELEASE_NOTES_URL}?t=${Date.now()}` : RELEASE_NOTES_URL;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((r: unknown) => {
        if (r == null || typeof r !== 'object') return null;
        const obj = r as Record<string, unknown>;
        const message = obj.message;
        return typeof message === 'string' ? { message } : null;
      })
      .filter((r): r is ReleaseNote => r != null);
  } catch {
    return [];
  }
}

export function getLastPlayedVersion(): string | null {
  try {
    return localStorage.getItem(LAST_PLAYED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayedVersion(version: string): void {
  try {
    localStorage.setItem(LAST_PLAYED_VERSION_KEY, version);
  } catch {
    // ignore
  }
}

export interface ReleasesToShowResult {
  releases: ReleaseNote[];
  lastDisplayedIndex: number;
}

/**
 * Returns releases the user should see.
 * - verified (lastSeenIndex): index of next unseen release. 0 = legacy (show all from 0).
 * - lastPlayedVersion: from localStorage, when they last played
 * @param bustCache - if true, fetches fresh from server (for periodic/change-triggered checks)
 */
export async function getReleasesToShow(lastSeenIndex: number, bustCache = false): Promise<ReleasesToShowResult> {
  const allReleases = await loadReleaseNotes(bustCache);
  if (allReleases.length === 0) return { releases: [], lastDisplayedIndex: -1 };

  const lastPlayedKey = getLastPlayedVersion();
  const currentIndex = allReleases.length - 1;

  // New user (verified set on register): if they haven't played, don't show
  if (lastPlayedKey === null && lastSeenIndex > 0) return { releases: [], lastDisplayedIndex: -1 };

  // verified = next unseen index. Legacy (0) -> show from 0; else show from verified
  const startFromSeen = lastSeenIndex;
  // Always show undismissed releases. lastPlayedVersion must not block (user may have played without seeing modal).
  if (startFromSeen > currentIndex) return { releases: [], lastDisplayedIndex: -1 };

  const releases = allReleases.slice(startFromSeen);
  const lastDisplayedIndex = releases.length > 0 ? startFromSeen + releases.length - 1 : -1;
  return { releases, lastDisplayedIndex };
}

/**
 * Records that the user played. Stores the current release index in localStorage.
 * Call when user submits a guess.
 */
export async function recordPlayed(): Promise<void> {
  const releases = await loadReleaseNotes();
  if (releases.length > 0) {
    setLastPlayedVersion(toIndexKey(releases.length - 1));
  }
}

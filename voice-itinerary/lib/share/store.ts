import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * File-backed share-link store for the demo. The in-memory Map remains the
 * hot path, but every save is mirrored to .next so local dev restarts do not
 * break /trip/<id> links.
 */

export type SharedTrip = {
  share_id: string;
  saved_at: number;
  // Loose shape — we don't need server-side type rigor; client validates.
  payload: unknown;
};

declare global {
  // eslint-disable-next-line no-var
  var __marhabaShareStore: Map<string, SharedTrip> | undefined;
  // eslint-disable-next-line no-var
  var __marhabaShareStoreLoadedFrom: string | undefined;
}

export const shareStore: Map<string, SharedTrip> =
  globalThis.__marhabaShareStore ??
  (globalThis.__marhabaShareStore = new Map<string, SharedTrip>());

function storePath(): string {
  return (
    process.env.MARHABA_SHARE_STORE_PATH ??
    join(process.cwd(), ".next", "marhaba-share-store.json")
  );
}

function loadFromDisk(): void {
  const path = storePath();
  if (globalThis.__marhabaShareStoreLoadedFrom === path) return;

  shareStore.clear();
  if (existsSync(path)) {
    try {
      const rows = JSON.parse(readFileSync(path, "utf8")) as SharedTrip[];
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row?.share_id && typeof row.saved_at === "number") {
            shareStore.set(row.share_id, row);
          }
        }
      }
    } catch (err) {
      console.warn("[share-store] ignoring unreadable store", err);
    }
  }
  globalThis.__marhabaShareStoreLoadedFrom = path;
}

function persistToDisk(): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify([...shareStore.values()], null, 2), "utf8");
  renameSync(tmp, path);
}

export function getSharedTrip(id: string): SharedTrip | undefined {
  loadFromDisk();
  return shareStore.get(id);
}

export function saveSharedTrip(share_id: string, payload: unknown): SharedTrip {
  loadFromDisk();
  const item = {
    share_id,
    saved_at: Date.now(),
    payload,
  };
  shareStore.set(share_id, item);
  persistToDisk();
  return item;
}

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSharedTrip,
  saveSharedTrip,
  shareStore,
} from "@/lib/share/store";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.MARHABA_SHARE_STORE_PATH;
  shareStore.clear();
  globalThis.__marhabaShareStoreLoadedFrom = undefined;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("share store", () => {
  test("reloads saved trips from disk after memory is cleared", () => {
    const dir = mkdtempSync(join(tmpdir(), "marhaba-share-store-"));
    tempDirs.push(dir);
    process.env.MARHABA_SHARE_STORE_PATH = join(dir, "shares.json");

    saveSharedTrip("abc123", {
      trip: { destination_name: "Dubai" },
      days: [],
    });

    shareStore.clear();
    globalThis.__marhabaShareStoreLoadedFrom = undefined;

    const reloaded = getSharedTrip("abc123");
    assert.equal(reloaded?.share_id, "abc123");
    assert.deepEqual(reloaded?.payload, {
      trip: { destination_name: "Dubai" },
      days: [],
    });
  });
});

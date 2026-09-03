import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Lichess standard sound assets", () => {
  it.each([
    ["Move.mp3", "7ed0cf66581fd7c1e3dc8b08303db12d9ef55f1f"],
    ["Capture.mp3", "ab51d763de8c3711e89ad7fbd23e99c360b3c062"],
    ["Error.mp3", "af769c0e910ac02c544bf4c0672870dc04739d9e"],
    ["Confirmation.mp3", "f941eaccf786457404e26552b63e41a721e4b5ed"],
    ["GenericNotify.mp3", "61bb1b60fb2255dbe4727273110b5f36b2ad140a"],
  ])("keeps %s byte-identical to the pinned upstream standard pack", (name, expected) => {
    const bytes = readFileSync(`public/sounds/lichess-standard/${name}`);
    const blobId = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(blobId).toBe(expected);
  });

  it("does not ship the superseded sfx pack", () => {
    expect(existsSync("public/sounds/lichess-sfx")).toBe(false);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { readerRailSectionOrder } from "./readerLayout.js";

test("reader rail keeps the study block ahead of playback", () => {
  assert.deepEqual(readerRailSectionOrder, ["study", "playback", "help"]);
  assert.ok(readerRailSectionOrder.indexOf("study") < readerRailSectionOrder.indexOf("playback"));
});

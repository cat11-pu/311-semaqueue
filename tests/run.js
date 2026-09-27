import assert from "node:assert";
import { freeRoom, wakeUp } from "../sema.js";
import { step, close } from "../semarun.js";
import { render } from "../app.js";

const base = {
  budget: 1, capacity: 3,
  state: { holders: [], queue: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "acquire", who: "a", share: 1 }],
  share_error_code: "E_BAD_SHARE", holding_error_code: "E_NOT_HOLDING",
  holder_error_code: "E_DUP_HOLDER", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("freeRoom returns a number", () => {
  assert.strictEqual(typeof freeRoom(3, [["a", 1]]), "number");
});

check("wakeUp returns holders and queue", () => {
  const got = wakeUp(3, [], []);
  assert.ok(Array.isArray(got.holders) && Array.isArray(got.queue));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);

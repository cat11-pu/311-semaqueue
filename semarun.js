// semarun.js：按处理预算处理并留账
import { freeRoom, wakeUp, placeHolder } from "./sema.js";

function errorCodes(spec) {
  return {
    share: spec.share_error_code || "E_BAD_SHARE",
    holder: spec.holder_error_code || "E_DUP_HOLDER",
    holding: spec.holding_error_code || "E_NOT_HOLDING",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

// 结构校验与预算无关：整批先看一遍，缺斤短两直接拒。
function checkEvent(ev, code) {
  const bad = !ev || typeof ev !== "object" || Array.isArray(ev)
    || (ev.kind !== "acquire" && ev.kind !== "release")
    || typeof ev.who !== "string" || ev.who.length === 0
    || (ev.kind === "acquire" && typeof ev.share === "undefined");
  if (bad) fail(code, "bad event");
}

function cloneEvent(ev) {
  return Object.assign({}, ev);
}

function compact(ev) {
  return ev.kind === "acquire" ? [ev.kind, ev.who, ev.share] : [ev.kind, ev.who];
}

function holdsWho(rows, who) {
  return rows.some(function (row) { return row[0] === who; });
}

function freshContext(spec, codes) {
  const state = spec.state || {};
  return {
    capacity: spec.capacity,
    holders: (state.holders || []).map(function (row) { return [row[0], row[1]]; }),
    queue: (state.queue || []).map(function (row) { return [row[0], row[1]]; }),
    applied: (state.applied || []).slice(),
    codes: codes
  };
}

function applyEvent(ctx, ev) {
  if (ev.kind === "acquire") {
    const share = ev.share;
    if (!Number.isInteger(share) || share <= 0 || share > ctx.capacity) {
      fail(ctx.codes.share, "bad share " + share);
    }
    if (holdsWho(ctx.holders, ev.who) || holdsWho(ctx.queue, ev.who)) {
      fail(ctx.codes.holder, "duplicate holder " + ev.who);
    }
    if (freeRoom(ctx.capacity, ctx.holders) >= share) {
      ctx.holders = placeHolder(ctx.holders, ev.who, share);
    } else {
      ctx.queue = ctx.queue.concat([[ev.who, share]]);
    }
  } else {
    if (!holdsWho(ctx.holders, ev.who)) {
      fail(ctx.codes.holding, "not holding " + ev.who);
    }
    ctx.holders = ctx.holders.filter(function (row) { return row[0] !== ev.who; });
    const woken = wakeUp(ctx.capacity, ctx.holders, ctx.queue);
    ctx.holders = woken.holders;
    ctx.queue = woken.queue;
  }
  if (typeof ev.id !== "undefined") ctx.applied.push(ev.id);
}

function alreadyApplied(ctx, ev) {
  return ev && typeof ev.id !== "undefined" && ctx.applied.indexOf(ev.id) >= 0;
}

export function step(spec) {
  const codes = errorCodes(spec);
  const events = spec.events || [];
  const budget = typeof spec.budget === "number" ? spec.budget : 0;
  const ledgerIn = ((spec.state || {}).ledger || []).map(cloneEvent);
  const batch = ledgerIn.concat(events);
  for (const ev of batch) checkEvent(ev, codes.event);

  const ctx = freshContext(spec, codes);
  let served = 0;
  let index = 0;
  while (index < batch.length && served < budget) {
    const ev = batch[index];
    index += 1;
    if (alreadyApplied(ctx, ev)) continue;
    applyEvent(ctx, ev);
    served += 1;
  }

  const ledger = batch.slice(index);
  return {
    state: { holders: ctx.holders, queue: ctx.queue, ledger: ledger, applied: ctx.applied },
    served: served,
    ledger_before: ledger.length,
    ledger: ledger.map(compact),
    judged: served,
    judged_bound: batch.length
  };
}

export function close(spec) {
  const codes = errorCodes(spec);
  const ledger = ((spec.state || {}).ledger || []).map(cloneEvent);
  for (const ev of ledger) checkEvent(ev, codes.event);

  const ctx = freshContext(spec, codes);
  let catchup = 0;
  for (const ev of ledger) {
    if (alreadyApplied(ctx, ev)) continue;
    applyEvent(ctx, ev);
    catchup += 1;
  }
  return {
    state: { holders: ctx.holders, queue: ctx.queue, ledger: [], applied: ctx.applied },
    catchup: catchup
  };
}

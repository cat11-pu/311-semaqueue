// semarun.js：按共用处理预算跑信号量事件，用尽则压账，收尾不限预算清账
import { freeRoom, wakeUp } from "./sema.js";

function errorCode(spec, key, fallback) {
  return (spec && spec[key]) || fallback;
}

function fail(codeValue, message) {
  const error = new Error(message);
  error.code = codeValue;
  throw error;
}

// 结构先校验，与预算无关；随后校验份额（静态事实，同样与预算无关）。
function validateEvents(events, spec, capacity) {
  for (const ev of events) {
    const wellShaped = ev !== null && typeof ev === "object" && !Array.isArray(ev)
      && (ev.kind === "acquire" || ev.kind === "release")
      && typeof ev.who === "string" && ev.who.length > 0;
    if (!wellShaped) {
      fail(errorCode(spec, "event_error_code", "E_BAD_EVENT"), "illegal event shape");
    }
  }
  for (const ev of events) {
    if (ev.kind === "acquire"
      && !(Number.isInteger(ev.share) && ev.share >= 1 && ev.share <= capacity)) {
      fail(errorCode(spec, "share_error_code", "E_BAD_SHARE"), "share must be a positive integer within capacity");
    }
  }
}

// 账内统一存事件对象（保留 id 供重放去重）；对外投影成 [kind, who, share?] 元组。
function toEvent(item) {
  if (Array.isArray(item)) {
    return item.length >= 3
      ? { id: item[3], kind: item[0], who: item[1], share: item[2] }
      : { id: undefined, kind: item[0], who: item[1] };
  }
  const ev = { id: item.id, kind: item.kind, who: item.who };
  if (ev.kind === "acquire") ev.share = item.share;
  return ev;
}

function project(ev) {
  return ev.kind === "release" ? [ev.kind, ev.who] : [ev.kind, ev.who, ev.share];
}

function cloneState(state) {
  state = state || {};
  return {
    holders: (state.holders || []).map(function (row) { return [row[0], row[1]]; }),
    queue: (state.queue || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (state.ledger || []).map(toEvent),
    applied: (state.applied || []).slice()
  };
}

function holdsOrWaits(state, who) {
  return state.holders.some(function (row) { return row[0] === who; })
    || state.queue.some(function (row) { return row[0] === who; });
}

function applyEvent(state, ev, spec, capacity) {
  if (ev.kind === "acquire") {
    if (holdsOrWaits(state, ev.who)) {
      fail(errorCode(spec, "holder_error_code", "E_DUP_HOLDER"),
        ev.who + " already holds or waits");
    }
    if (freeRoom(capacity, state.holders) >= ev.share) {
      state.holders.push([ev.who, ev.share]);
    } else {
      state.queue.push([ev.who, ev.share]);
    }
    return;
  }
  const index = state.holders.findIndex(function (row) { return row[0] === ev.who; });
  if (index < 0) {
    fail(errorCode(spec, "holding_error_code", "E_NOT_HOLDING"),
      ev.who + " does not hold a share");
  }
  state.holders.splice(index, 1);
  const woken = wakeUp(capacity, state.holders, state.queue);
  state.holders = woken.holders;
  state.queue = woken.queue;
}

function identity(ev) {
  return ev.id !== undefined ? ev.id : ev;
}

export function step(spec) {
  const capacity = spec.capacity;
  const events = spec.events || [];
  validateEvents(events, spec, capacity);

  const state = cloneState(spec.state);
  const work = state.ledger.concat(events.map(toEvent));
  state.ledger = [];

  let served = 0;
  let deferred = 0;
  for (const ev of work) {
    const uid = identity(ev);
    if (state.applied.indexOf(uid) !== -1) continue;
    if (served >= spec.budget) {
      state.ledger.push(ev);
      deferred += 1;
      continue;
    }
    applyEvent(state, ev, spec, capacity);
    state.applied.push(uid);
    served += 1;
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(project),
    judged: served + deferred,
    judged_bound: work.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const ev = state.ledger.shift();
    const uid = identity(ev);
    if (state.applied.indexOf(uid) !== -1) continue;
    applyEvent(state, ev, spec, spec.capacity);
    state.applied.push(uid);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}

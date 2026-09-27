// sema.js：信号量的占用与唤醒
export function freeRoom(capacity, holders) {
  let used = 0;
  for (const row of holders || []) used += row[1];
  return capacity - used;
}

// 持有表按主体名排序安放，保证同一批持有者只有唯一一种排法。
export function placeHolder(holders, who, share) {
  const next = (holders || []).map(function (row) { return [row[0], row[1]]; });
  next.push([who, share]);
  next.sort(function (a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  return next;
}

export function wakeUp(capacity, holders, queue) {
  let nextHolders = (holders || []).map(function (row) { return [row[0], row[1]]; });
  const nextQueue = (queue || []).map(function (row) { return [row[0], row[1]]; });
  while (nextQueue.length > 0 && freeRoom(capacity, nextHolders) >= nextQueue[0][1]) {
    const head = nextQueue.shift();
    nextHolders = placeHolder(nextHolders, head[0], head[1]);
  }
  return { holders: nextHolders, queue: nextQueue };
}

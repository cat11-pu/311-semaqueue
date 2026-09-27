// sema.js：信号量的剩余容量与排队唤醒
export function freeRoom(capacity, holders) {
  let used = 0;
  for (const row of holders) used += row[1];
  return capacity - used;
}

export function wakeUp(capacity, holders, queue) {
  const awakened = [];
  const rest = queue.slice();
  const baseFree = freeRoom(capacity, holders);
  let granted = 0;
  while (rest.length > 0) {
    const head = rest[0];
    if (baseFree - granted < head[1]) break;
    granted += head[1];
    awakened.push([rest.shift()[0], head[1]]);
  }
  const kept = holders.map(function (row) { return [row[0], row[1]]; });
  return { holders: awakened.concat(kept), queue: rest };
}

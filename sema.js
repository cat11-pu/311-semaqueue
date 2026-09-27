// sema.js：信号量的占用与唤醒（基线：一律原样返回）
export function freeRoom(capacity, holders) {
  return 0;
}

export function wakeUp(capacity, holders, queue) {
  return { holders: holders, queue: queue };
}

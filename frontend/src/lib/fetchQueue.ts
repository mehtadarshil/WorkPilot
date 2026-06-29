/** Limits parallel authenticated asset fetches (e.g. Stock/Tools thumbnails). */
const MAX_CONCURRENT = 8;

let active = 0;
const waiters: Array<() => void> = [];

function drain() {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    const next = waiters.shift();
    if (next) next();
  }
}

export function enqueueFetch<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    };

    if (active < MAX_CONCURRENT) run();
    else waiters.push(run);
  });
}

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function readTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
) {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = loader().catch((error) => {
    if (cache.get(key)?.value === value) {
      cache.delete(key);
    }

    throw error;
  });

  cache.set(key, {
    expiresAt: now + ttlMs,
    value,
  });

  return value;
}

const globalForInflight = globalThis as typeof globalThis & {
  __cashflowInflight?: Map<string, Promise<unknown>>;
};

// Collapse identical work that is already running. The result is not kept after
// it finishes, so this lowers peak memory without serving a stale copy.
export function dedupeInflight<T>(key: string, loader: () => Promise<T>) {
  const inflight = (globalForInflight.__cashflowInflight ??= new Map());
  const existing = inflight.get(key) as Promise<T> | undefined;

  if (existing) {
    return existing;
  }

  const pending = loader().finally(() => {
    if (inflight.get(key) === pending) {
      inflight.delete(key);
    }
  });

  inflight.set(key, pending);

  return pending;
}

export function clearTtlCache(keyPrefix?: string) {
  if (!keyPrefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

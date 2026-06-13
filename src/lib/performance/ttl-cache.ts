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

const memoryStore = new Map();

function normalizeScope(scope) {
  const clean = String(scope || 'guest').trim();
  return clean || 'guest';
}

function makeKey(key, scope) {
  return `wiredan_vending::${normalizeScope(scope)}::${String(key || '').trim()}`;
}

export const vendingCache = {
  get(key, fallback = null, scope = 'guest') {
    const fullKey = makeKey(key, scope);
    if (memoryStore.has(fullKey)) {
      return memoryStore.get(fullKey);
    }
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      memoryStore.set(fullKey, parsed);
      return parsed;
    } catch {
      return fallback;
    }
  },

  set(key, value, scope = 'guest') {
    const fullKey = makeKey(key, scope);
    memoryStore.set(fullKey, value);
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {}
    return value;
  },

  remove(key, scope = 'guest') {
    const fullKey = makeKey(key, scope);
    memoryStore.delete(fullKey);
    try {
      localStorage.removeItem(fullKey);
    } catch {}
  }
};

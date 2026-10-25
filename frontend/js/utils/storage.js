/**
 * ZIPLI — Storage Wrapper with Fallbacks
 */

const memoryStore = new Map();

export const storage = {
  get(key, defaultValue = null) {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return defaultValue;
      return JSON.parse(val);
    } catch {
      return memoryStore.has(key) ? memoryStore.get(key) : defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      memoryStore.set(key, value);
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
    }
  },

  clear() {
    try {
      localStorage.clear();
    } catch {
      memoryStore.clear();
    }
  },
};

/**
 * In-memory Jest mock for react-native-mmkv.
 * react-native-mmkv requires native modules (NitroModules) which aren't
 * available in a Jest/Node test environment. This mock replicates the v4 API
 * surface used by alarm-storage.ts.
 */
function createMemoryStore() {
  const store = new Map();
  return {
    getString: (key) => store.get(key),
    getBoolean: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
    contains: (key) => store.has(key),
    clearAll: () => store.clear(),
  };
}

module.exports = {
  createMMKV: jest.fn(() => createMemoryStore()),
  MMKV: jest.fn(() => createMemoryStore()),
};

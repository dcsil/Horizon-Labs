export const db = {
  doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }),
};

const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
export const openrouter = key
  ? { chat: async () => ({ message: "todo real" }) }
  : { chat: async () => ({ message: "noop" }) };

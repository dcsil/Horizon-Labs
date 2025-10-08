const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
export async function pingHealth() {
  const r = await fetch(`${base}/health`);
  return r.ok;
}

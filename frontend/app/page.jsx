"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center">
      <h1 className="text-3xl font-bold mb-6">Welcome to Hello Chat 👋</h1>
      <p className="text-gray-600 mb-8 max-w-md">
        This is the home page for the M0-03 milestone. Click below to open the chat interface.
      </p>
      <button
        onClick={() => router.push("/chat")}
        className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition"
      >
        Go to Chat 💬
      </button>
    </div>
  );
}

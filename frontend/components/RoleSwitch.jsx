"use client";
import { useEffect, useState } from "react";

export default function RoleSwitch() {
  const [role, setRole] = useState("student");
  useEffect(() => { const s = localStorage.getItem("role"); if (s) setRole(s); }, []);
  useEffect(() => { localStorage.setItem("role", role); }, [role]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Role:</span>
      <button onClick={() => setRole("student")}
        className={`px-3 py-1 rounded-full border text-sm ${role==="student"?"bg-black text-white":"bg-white"}`}>
        Student
      </button>
      <button onClick={() => setRole("instructor")}
        className={`px-3 py-1 rounded-full border text-sm ${role==="instructor"?"bg-black text-white":"bg-white"}`}>
        Instructor
      </button>
    </div>
  );
}

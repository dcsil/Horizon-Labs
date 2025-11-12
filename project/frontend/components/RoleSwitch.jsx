"use client";
import { useEffect, useState } from "react";

const ROLE_EVENT = "role-updated";

export default function RoleSwitch() {
  const [role, setRole] = useState("student");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("role");
    if (stored === "student" || stored === "instructor") {
      setRole(stored);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("role", role);
    window.dispatchEvent(new CustomEvent(ROLE_EVENT, { detail: role }));
  }, [role]);

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

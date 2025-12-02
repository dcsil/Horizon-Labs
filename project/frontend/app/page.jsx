"use client";
import clsx from 'clsx';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from 'next/font/google'
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const ROLE_EVENT = "role-updated";

/**
 * Landing page where users choose student or instructor role before continuing.
 */
export default function home() {
  const router = useRouter();
  const [role, setRole] = useState("student");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("role") : null;
    if (saved === "student" || saved === "instructor") setRole(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("role", role);
    window.dispatchEvent(new CustomEvent(ROLE_EVENT, { detail: role }));
  }, [role]);

  /** Routes the user to the login flow after selecting a role. */
  const onStart = () => {
    router.push("/LoginPage");
  };

  
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6">
      <h1 className={`text-[57.25px] font-bold font-[400] text-center tracking-[0.03em] ${poppins.className}`}>Choose your role</h1>
      <p className={`text-[25px] text-center font-[400] tracking-[0.03em] mt-10 ${poppins.className}`}>
        Select student if you would like to access our AI assistant.
      </p>
      <p className={`text-[25px] text-center font-[400] tracking-[0.03em] ${poppins.className}`}>Select instructor if you would like
        real-time analytics on student performance.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
      <button
        onClick={() => setRole("student")}
        className={`overflow-hidden rounded-4xl border-0 p-0 focus:outline-none ring-offset-transparent hover:scale-105 transition-all duration-300 ${role === 'student' ? 'ring-4 ring-offset-4 ring-indigo-500' : ''}`}
        >
          <img src="/student_btn.png" alt="Student" className="block w-full h-auto scale-[1.02] origin-center"/>
      </button>

        <button
          onClick={() => setRole("instructor")}
          className={`overflow-hidden rounded-4xl border-0 p-0 focus:outline-none ring-offset-transparent hover:scale-105 transition-all duration-300 ${role === 'instructor' ? 'ring-4 ring-offset-4 ring-indigo-500' : ''}`}
        >
          <img src="/instr_btn.png" alt="Instructor" className="block w-full h-auto scale-[1.02] origin-center"/>
        </button>


      </div>

      <button
        onClick={onStart}
        className={`w-[388px] h-[66px] inline-flex items-center justify-center font-medium rounded-xl mt-10 
            text-white
             bg-gradient-to-r from-purple-500 to-blue-500 
             hover:from-purple-600 hover:to-blue-600 
             transition-all duration-300 shadow-md ${poppins.className}`}
      >
        Get started
      </button>
    </div>
  );
}

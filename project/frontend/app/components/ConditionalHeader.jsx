"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLE_STORAGE_KEY = "role";
const ROLE_EVENT = "role-updated";

export default function ConditionalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("student");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (stored === "instructor" || stored === "student") {
      setRole(stored);
    }

    const handleRoleUpdated = (event) => {
      const nextRole = event?.detail;
      if (nextRole === "instructor" || nextRole === "student") {
        setRole(nextRole);
      }
    };

    window.addEventListener(ROLE_EVENT, handleRoleUpdated);
    return () => {
      window.removeEventListener(ROLE_EVENT, handleRoleUpdated);
    };
  }, []);

  const isInstructorFlow = pathname.startsWith("/Instructor");
  const effectiveRole = isInstructorFlow ? "instructor" : role;
  const handleProfileClick = () => {
    const destination = effectiveRole === "instructor" ? "/Instructor" : "/Student";
    router.push(destination);
  };

  if (pathname.includes("Score")) {
    return null;
  }

  const renderHeader = (backgroundClass = "bg-white", showProfile = true) => (
    <header className={`${backgroundClass} flex items-center justify-between px-10 py-4`}>
      <Link href="/" className="flex items-center gap-3">
        <Image src="/logo2.png" alt="Learn LLM" width={230} height={150} priority />
      </Link>
      {showProfile && (
        <button
          onClick={handleProfileClick}
          className="flex items-center gap-3"
          aria-label="Open account home"
        >
          <Image
            src={effectiveRole === "instructor" ? "/instru.png" : "/profile.png"}
            alt="Account"
            width={150}
            height={150}
            priority
          />
        </button>
      )}
    </header>
  );

  if (pathname.startsWith("/Student")) {
    return renderHeader();
  }

  if (pathname.startsWith("/Instructor")) {
    return renderHeader();
  }

  if (pathname.startsWith("/LoginPage")) {
    return renderHeader("bg-purple-100");
  }

  // Homepage - no profile image
  if (pathname === "/") {
    return renderHeader("bg-white", false);
  }

  return renderHeader();
}

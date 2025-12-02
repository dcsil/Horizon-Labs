"use client";
import { usePathname } from "next/navigation";

/**
 * Wraps pages with route-aware body backgrounds (purple for login, gray otherwise).
 */
export default function ConditionalBody({ children }) {
  const pathname = usePathname();
  
  // Use purple background for LoginPage and Student routes
  if (pathname.startsWith('/LoginPage')) {
    return (
      <body className="min-h-screen bg-purple-100">
        {children}
      </body>
    );
  }
  
  // Default layout for other pages
  return (
    <body className="min-h-screen bg-gray-50">
      {children}
    </body>
  );
}

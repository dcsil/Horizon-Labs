import React from "react";
import "./globals.css";
import ConditionalHeader from "./components/ConditionalHeader";
import ConditionalBody from "./components/ConditionalBody";

/**
 * Root layout for the Next.js app that wraps pages with the global header and body styling.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <ConditionalBody>
        <ConditionalHeader />
        {children}
      </ConditionalBody>
    </html>
  );
}

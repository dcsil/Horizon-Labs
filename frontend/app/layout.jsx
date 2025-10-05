import "./globals.css";
import RoleSwitch from "../components/RoleSwitch.jsx";

export const metadata = { title: "Hello Chat", description: "M0-03 Frontend skeleton" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
            <div className="font-semibold">CSC491 — Hello Chat</div>
            <RoleSwitch />
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
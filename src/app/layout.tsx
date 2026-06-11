import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Pre-RFP Comms",
  description: "Pre-RFP supplier communication manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <TopBar />
          <main className="container">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}

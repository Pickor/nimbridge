import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Nimbridge",
  description: "Internal price-tracking dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-white antialiased flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}

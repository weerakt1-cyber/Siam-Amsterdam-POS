import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baze Partner",
  description: "Baze affiliate — your referral earnings",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roche | Doing now what patients need next",
  description: "Pioneering diagnostics and pharma to create a healthier future for everyone.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roche | Doing now what patients need next",
  description: "Pioneering diagnostics and pharma to create a healthier future for everyone.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><head><meta name="referrer" content="unsafe-url" /></head><body>{children}</body></html>;
}

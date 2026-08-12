import type { Metadata } from "next";
import { Nunito_Sans, Rufina } from "next/font/google";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  display: "swap",
});

const rufina = Rufina({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-rufina",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mydermlounge.com"),
  title: "My Derm Lounge",
  description: "Advanced dermatology and medical aesthetics in Anaheim, CA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunitoSans.variable} ${rufina.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

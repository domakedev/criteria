import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "criteria — decide con experiencia real",
  description:
    "Anota tus decisiones, cierra el ciclo con lo que pasó de verdad y consulta la experiencia real de la comunidad. Sin humo: aquí nadie decide por ti.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}

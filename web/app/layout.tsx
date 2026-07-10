import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "criteria — decide con experiencia real",
  description:
    "Cuenta tus decisiones con tu voz o por escrito y la IA las ordena por ti. Cierra el ciclo con lo que pasó de verdad y consulta la experiencia real de la comunidad — con nombre o en anónimo. Aquí nadie decide por ti.",
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

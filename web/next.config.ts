import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin arrastra jwks-rsa → jose, que es ESM-only; si Turbopack lo
  // empaqueta, require() de esos paquetes falla con ERR_REQUIRE_ESM.
  // Externalizarlos deja que Node los resuelva nativo.
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
  // hay otro package-lock.json en la raíz del repo (el motor de referencia);
  // fijar la raíz evita que Turbopack la infiera mal
  turbopack: { root: __dirname },
};

export default nextConfig;

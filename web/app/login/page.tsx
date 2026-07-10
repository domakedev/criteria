"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import {
  authErrorMessage,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  resetPassword,
  useSession,
} from "@/components/auth";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { user, enabled } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  useEffect(() => {
    if (user) router.replace("/app");
  }, [user, router]);

  const enterGoogle = async () => {
    setError("");
    setNotice("");
    setBusy("google");
    try {
      await loginWithGoogle();
      router.replace("/app");
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy("email");
    try {
      if (mode === "signup") {
        await registerWithEmail(email, password, name);
      } else {
        await loginWithEmail(email, password);
      }
      router.replace("/app");
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  const forgot = async () => {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu contraseña?”.");
      return;
    }
    try {
      await resetPassword(email.trim());
      setNotice("Te enviamos un correo para restablecer tu contraseña.");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-600 focus:outline-none";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-xl font-semibold">
          {mode === "signup" ? "Crear cuenta" : "Entrar"}
        </h1>
        <p className="mt-1 text-center text-sm text-stone-500">
          Tus decisiones privadas solo las ves tú.
        </p>

        {!enabled ? (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Falta configurar Firebase (variables{" "}
            <code>NEXT_PUBLIC_FIREBASE_*</code>). Sigue los pasos de{" "}
            <code>web/README.md</code>.
          </p>
        ) : (
          <>
            <button
              onClick={enterGoogle}
              disabled={busy !== null}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path
                  fill="#FFC107"
                  d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
                />
                <path
                  fill="#FF3D00"
                  d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 40.4 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"
                />
              </svg>
              {busy === "google" ? "Entrando…" : "Continuar con Google"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />o con tu correo
              <span className="h-px flex-1 bg-stone-200" />
            </div>

            <form onSubmit={submitEmail} className="space-y-3">
              {mode === "signup" ? (
                <input
                  className={field}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre (así te verá la comunidad)"
                  autoComplete="name"
                  required
                />
              ) : null}
              <input
                className={field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
              />
              <input
                className={field}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
              />

              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={forgot}
                  className="text-xs text-stone-500 hover:text-emerald-800 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              ) : null}

              <button
                type="submit"
                disabled={busy !== null}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy === "email"
                  ? "Un momento…"
                  : mode === "signup"
                    ? "Crear cuenta"
                    : "Entrar"}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-stone-500">
              {mode === "signup" ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError("");
                  setNotice("");
                }}
                className="font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                {mode === "signup" ? "Inicia sesión" : "Créala gratis"}
              </button>
            </p>
          </>
        )}

        {error ? <p className="mt-3 text-center text-sm text-red-700">{error}</p> : null}
        {notice ? (
          <p className="mt-3 text-center text-sm text-emerald-700">{notice}</p>
        ) : null}
      </div>
      <p className="mt-4 text-center text-xs text-stone-400">
        Tus decisiones son privadas por defecto. Si compartes una, eliges si
        sale con tu nombre o en anónimo — tu correo nunca se muestra.
      </p>
    </main>
  );
}

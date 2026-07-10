"use client";

// Sesión con Firebase Auth (Google). Un solo hook para toda la app.
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseApp, firebaseEnabled } from "@/lib/firebase";

export interface Session {
  /** null = sin sesión; undefined = todavía cargando. */
  user: User | null | undefined;
  enabled: boolean;
}

export function useSession(): Session {
  const [user, setUser] = useState<User | null | undefined>(
    firebaseEnabled ? undefined : null,
  );

  useEffect(() => {
    if (!firebaseEnabled) return;
    let unsub = () => {};
    (async () => {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(getAuth(firebaseApp()), (u) => setUser(u));
    })();
    return () => unsub();
  }, []);

  return { user, enabled: firebaseEnabled };
}

export async function loginWithGoogle(): Promise<void> {
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import(
    "firebase/auth"
  );
  await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(getAuth(firebaseApp()), email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import(
    "firebase/auth"
  );
  const cred = await createUserWithEmailAndPassword(
    getAuth(firebaseApp()),
    email,
    password,
  );
  // El nombre alimenta el `author` de los casos (ver lib/admin verifyRequestUser).
  // Tras updateProfile hay que forzar el refresh del ID token para que el claim
  // `name` viaje en la siguiente llamada a /api/*; si no, el primer caso saldría
  // como "anónimo".
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
    await cred.user.getIdToken(true);
  }
}

export async function resetPassword(email: string): Promise<void> {
  const { getAuth, sendPasswordResetEmail } = await import("firebase/auth");
  await sendPasswordResetEmail(getAuth(firebaseApp()), email);
}

export async function logout(): Promise<void> {
  const { getAuth, signOut } = await import("firebase/auth");
  await signOut(getAuth(firebaseApp()));
}

/** Traduce los códigos de Firebase Auth a mensajes claros en español. */
export function authErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "Ese correo ya tiene una cuenta. Inicia sesión.";
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/missing-password":
      return "Escribe tu contraseña.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera un momento e intenta de nuevo.";
    case "auth/network-request-failed":
      return "Sin conexión. Revisa tu internet e intenta de nuevo.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Cerraste la ventana de Google antes de terminar.";
    default:
      return "No se pudo continuar. Intenta de nuevo.";
  }
}

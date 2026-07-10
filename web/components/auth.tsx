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

export async function logout(): Promise<void> {
  const { getAuth, signOut } = await import("firebase/auth");
  await signOut(getAuth(firebaseApp()));
}

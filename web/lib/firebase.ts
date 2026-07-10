// Inicialización de Firebase (cliente). La app requiere las variables
// NEXT_PUBLIC_FIREBASE_* — sin ellas se muestra un aviso de configuración.
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = !!config.apiKey && !!config.projectId;

export function firebaseApp(): FirebaseApp {
  if (!firebaseEnabled) throw new Error("Firebase no está configurado");
  return getApps()[0] ?? initializeApp(config);
}

/**
 * ID token del usuario en sesión, para autenticar las llamadas a /api/*.
 * Devuelve null si no hay sesión.
 */
export async function idToken(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  const { getAuth } = await import("firebase/auth");
  const user = getAuth(firebaseApp()).currentUser;
  return user ? user.getIdToken() : null;
}

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

/**
 * Emulador de Auth para pruebas locales (`firebase emulators:start`). Si la
 * variable está definida, el cliente habla con el emulador en vez de con
 * Firebase real — así se puede probar la app entera sin crear un proyecto.
 * En producción no se define y todo funciona igual que siempre.
 */
const authEmulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";

export function firebaseApp(): FirebaseApp {
  if (!firebaseEnabled) throw new Error("Firebase no está configurado");
  return getApps()[0] ?? initializeApp(config);
}

let emulatorReady = false;

/** getAuth() con el emulador enchufado la primera vez, si toca. */
export async function firebaseAuth() {
  const { getAuth, connectAuthEmulator } = await import("firebase/auth");
  const auth = getAuth(firebaseApp());
  if (authEmulator && !emulatorReady) {
    emulatorReady = true;
    connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true });
  }
  return auth;
}

/**
 * ID token del usuario en sesión, para autenticar las llamadas a /api/*.
 * Devuelve null si no hay sesión.
 */
export async function idToken(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  const user = (await firebaseAuth()).currentUser;
  return user ? user.getIdToken() : null;
}

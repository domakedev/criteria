# criteria — web (MVP)

La app de criteria para todo el mundo: una página simple donde anotas tus
decisiones (escribiendo o **dictando con tu voz**), cierras el ciclo con lo que
pasó de verdad, y consultas la experiencia real de la comunidad.

- **Next.js** (App Router) — el motor de criterio corre en el servidor.
- **Firebase** — sesión con Google (Auth) y datos en Firestore.
- **Dictado por voz** — Web Speech API del navegador. El reconocimiento es del
  sistema y solo sirve para *registrar*.
- **Lectura de la IA (opcional)** — con `GEMINI_API_KEY`, Gemini lee los casos
  humanos que el motor recuperó y redacta una recomendación basada SOLO en
  ellos (prompt endurecido contra inyección: los casos entran como datos, los
  ids citados se validan contra los casos reales, y sin respaldo suficiente la
  IA debe decir "no alcanza"). La decisión final siempre es del humano.
- El navegador nunca toca Firestore: todo pasa por `/api/*` con el Admin SDK
  y verificación del ID token.

## Configurar Firebase (una vez, ~5 minutos)

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Comenzar → habilita el proveedor **Google**.
3. **Firestore Database** → Crear base de datos (modo producción).
4. En **Reglas** de Firestore, pega el contenido de [`firestore.rules`](./firestore.rules)
   y publica (bloquea todo acceso directo de clientes; la app usa el Admin SDK).
5. Configuración del proyecto → **Tus apps** → agrega una app **Web** y copia
   los valores al `.env.local` (ver abajo).
6. Configuración del proyecto → **Cuentas de servicio** → *Generar nueva clave
   privada*. Pega el JSON (en una línea o en base64) en `FIREBASE_SERVICE_ACCOUNT`.
7. (Opcional, para la "Lectura de la IA") crea una API key en
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y ponla en
   `GEMINI_API_KEY`. Sin ella la app funciona igual, solo sin esa sección.

```bash
cp .env.local.example .env.local   # y completa los valores
```

## Correr

```bash
npm install
npm run dev        # http://localhost:3000
```

## Desplegar (Vercel)

Importa el repo en Vercel con **Root Directory = `web/`**, agrega las mismas
variables de entorno y listo. Recuerda añadir el dominio de producción en
Firebase → Authentication → Configuración → Dominios autorizados.

## Datos

```
community/{id}          casos compartidos (públicos, con nombre del autor)
users/{uid}/cases/{id}  casos personales (solo su dueño)
```

Cada documento es un **Decision Case** del formato abierto definido en
[`../spec/`](../spec/SPEC.md):

```
situación → lentes (peso + lectura) → decisión + porqué + duda
         → expectativa → resultado (el ciclo cerrado)
```

El motor (en `lib/engine.ts`, espejo de `../src/query.ts`) **nunca piensa**:
recupera y agrega casos humanos, siempre con procedencia. Los pesos de los
lentes no se configuran — **emergen** de las decisiones que salieron bien.

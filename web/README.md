# criteria — web (MVP)

La app de criteria para todo el mundo: cuentas tus decisiones **con tus
palabras** (texto o voz), la IA las ordena, cierras el ciclo con lo que pasó
de verdad, y consultas la experiencia real de la comunidad.

- **Next.js** (App Router) — el motor de criterio corre en el servidor.
- **Firebase** — sesión con Google o correo (Auth) y datos en Firestore.
- **Captura sin fricción** — en "Anotar" cuentas la decisión en un solo relato
  (o la dictas) y Gemini la ordena en el formato del caso (`/api/draft`). La
  IA **solo ordena, nunca inventa**: lo que no contaste queda vacío y marcado;
  tú revisas el borrador antes de guardar. El formulario campo por campo sigue
  disponible (y es el único modo sin `GEMINI_API_KEY`).
- **Dictado por voz** — Web Speech API del navegador. El reconocimiento es del
  sistema y solo sirve para *registrar*.
- **Privacidad por decisión** — cada caso es privado por defecto; al
  compartirlo eliges **con tu nombre** o **anónimo** (el correo jamás se
  muestra; `authorUid` queda solo en el documento para cerrar el ciclo).
- **Alcance al preguntar** — en "Preguntar" eliges buscar en **todo**, **solo
  tus decisiones** o **solo la comunidad** (`scope` en `/api/ask` y
  `/api/analyze`).
- **Consejo de criterio en frío** — si el motor no encuentra experiencias
  parecidas, la IA no deja al usuario con las manos vacías: aconseja aplicando
  el método criteria (lentes ponderados, preguntas abiertas, sesgos a vigilar,
  lenguaje de posibilidad) vía `/api/advise`, SIEMPRE etiquetado como consejo
  de IA "sin experiencias reales aún" — nunca se disfraza de experiencia
  humana — y con invitación a anotar la decisión para la próxima persona.
- **Lectura de la IA (opcional)** — con `GEMINI_API_KEY`, Gemini lee los casos
  humanos que el motor recuperó y redacta una recomendación basada SOLO en
  ellos (prompt endurecido contra inyección: los casos entran como datos, los
  ids citados se validan contra los casos reales, y sin respaldo suficiente la
  IA debe decir "no alcanza"). La decisión final siempre es del humano.
- **Servidor MCP integrado** — `/api/mcp` habla Model Context Protocol
  (JSON-RPC sobre POST). Desde la pestaña **Conectar IA** el usuario genera un
  token personal (`crit_…`, solo se guarda su hash SHA-256) y conecta Claude u
  otro cliente MCP, que obtiene tres herramientas: `ask_criteria`,
  `save_decision` y `list_my_decisions`.
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

## Conectar una IA por MCP

En la app → pestaña **Conectar IA** → *Generar token*. Luego, con Claude Code:

```bash
claude mcp add --transport http criteria https://TU-DOMINIO/api/mcp \
  --header "Authorization: Bearer crit_…"
```

O en la configuración de Claude Desktop (u otro cliente MCP por HTTP):

```json
{
  "mcpServers": {
    "criteria": {
      "type": "http",
      "url": "https://TU-DOMINIO/api/mcp",
      "headers": { "Authorization": "Bearer crit_…" }
    }
  }
}
```

El token se puede regenerar o revocar en cualquier momento desde la misma
pestaña; al hacerlo, el anterior deja de funcionar al instante.

## Datos

```
community/{id}          casos compartidos (públicos; author = nombre o "anónimo")
users/{uid}/cases/{id}  casos personales (solo su dueño)
users/{uid}.mcpToken    estado del token MCP (hash, prefijo, fecha)
apiTokens/{hash}        búsqueda inversa token→usuario para /api/mcp
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

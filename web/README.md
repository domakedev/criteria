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
- **Entrenar** — el usuario escribe un tema ("React", "emprender"…) y la IA
  genera escenarios de decisión con opciones listas para marcar
  (`/api/train`). Cada respuesta se guarda vía `/api/cases` como un caso del
  usuario (privado, con nombre o anónimo), etiquetado con el tema y
  `entrenamiento` en `context.tags`; si ya vivió algo así, cierra el ciclo de
  una vez. La IA propone situaciones — el criterio guardado es 100 % humano.
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

## Mascotitas (la colonia, en `/mascotita`)

Una **sociedad de criaturas con cerebro propio** que vive en este repositorio
y en tres mundos imaginados. Es un experimento personal, no aparece en la
navegación general: se entra por `/mascotita` con la misma sesión de criteria
y solo para quienes estén en `MASCOTITA_OWNERS` (los "dioses"). El diseño
completo, con lo que es aprendizaje real y lo que no, está en
`lib/mascotita/PLAN.md`.

**Cero IA externa en las criaturas.** Cada una tiene su propia red neuronal
(96 → 48 → 24, tres cabezas: valor de la acción, modelo del mundo y símbolos;
≈ 6 300 parámetros) escrita a mano en TypeScript en `lib/mascotita/nn.ts`,
con backprop y SGD propios. Elige qué hacer puntuando las acciones que el
entorno le ofrece, aprende un paso de gradiente por experiencia, guarda un
anillo de memorias y sueña (replay) una vez al día. Ve el mundo como señales
crudas (hashing de tokens de rutas, objetos, zonas y verbos: `senales.ts`),
nunca como etiquetas. Sus creencias son una tabla (objetivo, verbo) → valor y
veces, hecha solo de lo que vivió. Los pesos van a Firestore en base64
(≈ 33 KB por criatura). Gemini no interviene: como mucho, en la fase final,
te resume a ti lo que pasó (solo lectura).

**El latido.** La colonia vive 24 horas: `.github/workflows/latido.yml`
llama a `/api/mascotita/cron` cada 15 minutos con `Authorization: Bearer
$CRON_SECRET`. Cada latido toma el candado del mundo, tickea a las vivas en
round-robin (≤ 12 por latido, con plazo por criatura y ≤ 6 fetches al repo
repartidos), guarda cada una apenas termina y al final el mundo y la crónica.
La página dispara un latido al abrirse si el último tiene más de 25 min
(catch-up) y, con **Vigilia** encendida (el botón de la cabecera, por
defecto sí), sigue latiendo cada 15 min mientras la pestaña esté abierta:
sirve para vivir sin configurar la Action. `vercel.json` conserva un cron
diario de respaldo. Sin Action y sin pestaña abierta, la colonia solo late
una vez al día.

**El terrario.** `/mascotita` es un mapa de tiles (canvas, todo procedural,
estética de consola de 16 bits) con cuatro regiones: bosque, ciudad, cine y
el repositorio. Las criaturas caminan entre zonas, muestran una burbuja con
la sílaba que acaban de emitir, comen los puntos ámbar y se multiplican a la
vista. Alrededor: la crónica, la mente de la criatura tocada (cada candidata
con el valor que le dio su red y cuál eligió), el léxico del intérprete
(glosas con n y PMI, medidores de bits), el árbol genealógico, el panel del
dios (comida, fuentes, teclado de símbolos), los límites y el narrador
(Gemini le cuenta al dueño qué pasó; nada vuelve a las criaturas).

**Presupuesto gratis.** Firestore cuenta documentos: un latido cuesta
≈ 2 lecturas y 2 escrituras por criatura más un puñado fijo. Con 12 vivas y
96 latidos son ≈ 2 700 escrituras/día (14 % del tope gratis). Los contadores
reales del día viven en el documento del mundo; al 90 % del tope el latido
entra en modo ahorro (tickea la mitad) y ninguna cría nace si la proyección
de mañana no cabe (`presupuesto.ts`). Todo tope está en `config.ts` y se
muestra en la UI.

### Configurar

**En Vercel** (el resto — Firebase, `GEMINI_API_KEY` — ya lo usa el proyecto):

| Variable | Valor | Para qué |
|---|---|---|
| `MASCOTITA_OWNERS` | tu correo (o tu uid de Firebase) | Solo los dioses entran. Vacío = cualquier usuario con sesión. |
| `CRON_SECRET` | una cadena larga al azar | Autoriza el latido (Action y cron de Vercel). |
| `GITHUB_TOKEN` | token de solo lectura (recomendado) | Sin él GitHub limita a 60 peticiones/hora por IP compartida y las criaturas ven menos del repo. |

**En GitHub** (Settings → Secrets and variables → Actions):

| Tipo | Nombre | Valor |
|---|---|---|
| secret | `CRON_SECRET` | el mismo que en Vercel |
| variable | `MASCOTITA_URL` | `https://tu-dominio.vercel.app` (sin barra final) |

GitHub retrasa los crons en horas pico y **desactiva los workflows
programados de un repo público tras 60 días sin commits**: la página avisa
si el último latido tiene más de 2 h.

### Probarla

**Sin Firestore, en tu máquina** (la prueba de humo, 8 segundos):

```bash
cd web
npm install
npx -y tsx scripts/humo.ts             # todos los escenarios
npx -y tsx scripts/humo.ts laboratorio # uno solo: latido | laboratorio | mundo | repo | sociedad
```

Corre latidos reales sobre un store en memoria y un repo falso: mide que la
red aprende (deja de comer el hongo malo, prefiere la fruta), que repetir un
latido es idempotente, que ningún documento tiene NaN ni pesa de más, y
cuántas lecturas/escrituras cuesta cada día.

**Con los emuladores de Firebase** (igual que el resto de la web):

```bash
cd web
npx -y firebase-tools emulators:start --project demo-mascotita   # Auth + Firestore
```

y en otra terminal, con un `.env.local` como el de `.env.local.example`
(apuntando a los emuladores) y `CRON_SECRET=local`: `npm run dev`, entra a
`/mascotita`, funda la colonia y pulsa **Latir ahora**. Para forzar un latido
desde fuera: `curl -H "Authorization: Bearer local" http://localhost:3000/api/mascotita/cron`.

**Añadir un entorno imaginado** = agregar un objeto a `IMAGINED` en
`lib/mascotita/envs/data.ts` (zonas, objetos, verbos, reacciones con su
probabilidad oculta) y su id al final de `ENV_ORDEN` en `senales.ts`.

```
colonia/principal                     mundo: latido, contadores del día, población, fotos, recursos, señales
colonia/principal/criaturas/{cid}     estado, genes, rasgos, creencias, memorias, último tick
colonia/principal/cerebros/{cid}      pesos de la red (base64 float32)
colonia/principal/cronica/{día}       eventos del día (≤ 400)
mascotita_cache/repoTree              árbol del repo (1 fetch/día, compartido)
```

**Mudarla a tu servidor.** Todo es TypeScript dentro de esta app: basta Node
≥ 20, `next build && next start`, las mismas variables y algo que llame a
`/api/mascotita/cron` cada 15 min. Lo único de Vercel es `vercel.json`. La
base es Firestore; `lib/mascotita/store.ts` es la única interfaz a
reimplementar si un día la quieres local.

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

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

## Mascotita (experimento en `/mascotita`)

Una criatura que **vive en el repositorio** y aprende sola, día a día, por
ensayo y error — inspirada en los *Thronglets* de Black Mirror, pero criada
por ti. Es un experimento personal: no aparece en la navegación de la app;
se entra por la URL `/mascotita` con la misma sesión de criteria.

**Qué hace.** Cada "tick" (una vez al día por cron, al abrir la página si
lleva tiempo dormida, o a mano con *Explorar ahora*) elige un entorno, actúa
2-3 veces, percibe lo que vio, reflexiona y escribe su diario. El entorno
real es este repo (lee archivos de GitHub, sigue imports que a veces no
resuelven, nota commits nuevos, comprueba hipótesis contra el código); los
imaginados (bosque, ciudad, cine) son mundos definidos como datos en
`lib/mascotita/envs/data.ts` con reacciones ocultas que solo descubre
probando. Al volver, la página muestra **"Mientras no estabas"**: qué aprendió,
qué olvidó, cómo cambió su personalidad — calculado a partir de los números
guardados, no narrado de memoria.

**Cómo aprende de verdad.** Su "yo" son números en Firestore, no un prompt:
una política por entorno (bandit con exploración UCB y softmax cuya
temperatura baja con la madurez), habilidades con conteos, un grafo de
conceptos con confianza que se refuerza, se contradice y decae (repetición
espaciada), memorias con saliencia que se consolidan en hábitos o se olvidan,
seis rasgos de personalidad que derivan con lo que vive, ánimo e impulsos
(energía, aburrimiento, soledad), y etapas de vida por experiencia. La IA
(Gemini) es solo un órgano de **percepción** (texto → conceptos) y de
**lenguaje** (diario, charla): nunca decide acciones ni escribe estado.

**Cambiar de cerebro.** `lib/mascotita/brain/index.ts` define la interfaz
`Brain` (`perceive` / `reflect` / `speak`, JSON validado). `MASCOTITA_BRAIN`
elige: `gemini` (default con `GEMINI_API_KEY`), `simple` (determinista, sin
IA — la mascota vive igual, con menos voz) o `custom` (tu propio modelo
detrás de `MASCOTITA_BRAIN_URL`, mismo contrato). Los pares entrada→salida de
cada tick quedan en `mascotas/{uid}/ticks/*` como dataset para entrenarlo.

**Desplegar.** En Vercel agrega `MASCOTITA_OWNERS` (tu correo o uid — si no,
cualquier usuario con sesión puede criar una) y `CRON_SECRET` (cualquier
cadena larga); `web/vercel.json` ya declara el cron diario (`09:00 UTC` =
04:00 en Lima). El plan Hobby permite un cron al día, suficiente: el resto lo
cubre el catch-up al abrir la página. Topes por día (ticks, llamadas a la IA,
charlas) en `.env.local.example`; sin cambiar nada, el peor caso ronda
~60k tokens/día de Gemini Flash.

**Añadir un entorno imaginado** = agregar un objeto a `IMAGINED` en
`lib/mascotita/envs/data.ts` (zonas, objetos, verbos, reacciones con su
probabilidad oculta). Nada más: aparece en el selector.

```
mascotas/{uid}                     estado numérico (rasgos, política, ánimo, contadores, candado)
mascotas/{uid}/conocimiento/{slug} conceptos con confianza, fuentes, aristas
mascotas/{uid}/memorias/{id}       episodios con saliencia (se consolidan o se olvidan)
mascotas/{uid}/diario/{id}         entradas del diario con su delta numérico
mascotas/{uid}/charlas/{id}        conversación con el dueño
mascotas/{uid}/entornos/{envId}    cursor por entorno (rutas visitadas, zona, ensayos)
mascotas/{uid}/ticks/{seq}         log de cada tick + entradas/salidas del cerebro (dataset)
mascotita_cache/repoTree           árbol del repo (1 fetch/día, compartido)
mascotita_cache/usage              llamadas a la IA del día (tope global)
```

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

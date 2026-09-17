# Mascotitas — plan de la sociedad con cerebro propio

Estado: **aprobado** (con las decisiones de la sección 14 ya incorporadas). Se construye por fases y cada fase termina con código + prueba de humo + build + commit + resumen, esperando tu OK antes de la siguiente.

Rama: `claude/mascotitas-sociedad-f93fj9`, que parte de `main` (`359e95a`), donde ya está fusionada la primera versión (`5764e22`).

---

## 0. Qué se reutiliza y qué se reemplaza

Leí `web/lib/mascotita`, `web/app/mascotita`, `web/app/api/mascotita` y `web/components/mascotita` (≈ 12 000 líneas).

**Se reutiliza tal cual o con cambios chicos**

- `envs/repo.ts` (845 líneas): lectura del repo real con hosts fijos, árbol cacheado un fetch/día, imports que no resuelven, 404 reales, `verCambios`. Cambia solo el contrato de salida (además de texto, devolverá **señales crudas**, ver §2.2).
- `envs/imagined.ts` + `envs/data.ts` (bosque, ciudad, cine): el motor de mundos como datos con reacciones ocultas. Se le agregan: comida por zona, zonas "cerradas" que el dios abre, y varias criaturas en la misma zona.
- `rng.ts` (PRNG sembrado, softmax, clamp, round3): igual.
- `auth.ts` (allowlist `MASCOTITA_OWNERS`, `CRON_SECRET` en tiempo constante): igual.
- `db.ts`: se mantiene como **único** punto de acceso a Firestore, con el patrón de `clean()`, lotes ≤ 400, sin índices compuestos. Se reescribe por dentro para las colecciones nuevas y se separa en una interfaz `Store` con dos implementaciones (Firestore y memoria) para la prueba de humo.
- `cognition.ts`: se conservan las funciones puras que siguen teniendo sentido sin LLM: rasgos y su deriva (`driftTraits`, `snapshotTraits`), ánimo e impulsos (`applyTime`, `applyStepMood`, `moodWordFor`), etapas (`stageFor`, `addXp`), `limaDayKey`, `slugify`, `suggestNames`. Se eliminan las que dependían de percepción por LLM (conceptos con `claim` en texto, veredictos, reglas, consolidación de memorias en hábitos textuales).
- `tick.ts`: se conserva la estructura (candado → episodio de K pasos → efectos → persistencia en `finally`, ids derivados de `seq` para reintentos idempotentes). Se reemplaza el interior: la elección de acción pasa de la fórmula UCB a la red, y desaparecen `perceive`/`reflect`.
- UI: `avatar.tsx` (SVG procedural) se convierte en el generador de sprites del terrario; `traits-panel.tsx`, `shared.ts` y el estilo se reaprovechan en la vista "mente".
- `vercel.json` (cron diario) se queda como respaldo del latido.

**Se elimina de mascotita** (el resto de criteria no se toca: `lib/ai.ts`, `/api/ask`, `@google/genai` siguen)

- `brain/gemini.ts`, `brain/custom.ts`, `brain/simple.ts`, `brain/sanitize.ts`, `brain/index.ts` (interfaz Brain con perceive/reflect/speak), `chat.ts`.
- Rutas `chat`, `teach`, `knowledge`, `diary`, `env`, `hatch` y los paneles `chat-panel`, `teach-panel`, `knowledge-panel`, `diary-panel`, `report-card`, `env-picker`.
- Colecciones `mascotas/{uid}/*` (conocimiento, memorias, diario, charlas, ticks) y `mascotita_cache/usage`. Ver §11 (migración).
- Variables `MASCOTITA_BRAIN`, `MASCOTITA_BRAIN_URL/TOKEN`, `MASCOTITA_MAX_LLM_*`, `MASCOTITA_MAX_CHATS_DAY`, `MASCOTITA_MAX_TEACH_DAY`.

---

## 1. Honestidad primero: qué será aprendizaje real y qué no

**Real (sale de la experiencia, nadie lo escribe a mano)**

- La **decisión** de cada paso: la red de cada criatura puntúa las acciones posibles y elige (softmax sobre sus propios valores). Ninguna fórmula fija de rasgos decide por ella; los rasgos solo modulan temperatura y costos.
- El **aprendizaje**: un paso de gradiente por experiencia (backprop propio, sin librerías) y el "sueño" nocturno (reentrenar sobre una muestra de sus memorias). Los pesos cambian con lo vivido y se guardan.
- La **curiosidad**: recompensa intrínseca = error de predicción de su propio modelo del mundo (una cabeza de la red que predice si le irá bien). Sorpresa real, no una etiqueta.
- Las **creencias**: tabla `(objetivo, verbo) → valor esperado, n` construida solo de resultados propios (y heredadas del padre). "hongo-rojo·comer → −0.62 (n=7)" es lo que la criatura de verdad vivió.
- La **herencia**: genes con mutación, pesos con ruido, creencias más firmes copiadas. La selección la hace el mundo: quien no come o se equivoca grave, muere sin descendencia.
- La **elección de símbolos** (qué emitir y cuándo) y su **efecto** en quien oye: ambos pasan por la red y se entrenan por recompensa.
- Las **glosas** del intérprete: estadística sobre emisiones reales, con n visible y "sin datos suficientes" cuando no llega.

**Diseñado por nosotros (simulación o reglas fijas, dicho claramente)**

- Las recompensas de los mundos imaginados (las tablas de `data.ts`) y las del repo (404 = −0.5, etc.). Son las "leyes físicas"; las escribo yo.
- La **presión social** que hace posible el lenguaje (§6.3): es una regla de recompensa que yo pongo. Lo que sí es emergente es *qué* símbolo termina significando *qué*, si algo llega a significar.
- La regla de muerte y de reproducción (umbrales en `config.ts`).
- Las palabras de ánimo ("inquieta", "orgullosa") se derivan de números con una fórmula, como hoy.
- **Ya no hay voz.** Sin LLM no hay diario "en su voz". La crónica de la sociedad son hechos en plantillas ("Sisa comió fruta en el arroyo (+0.35)"), y la única "voz" de las criaturas son sus símbolos. Te lo digo porque es una pérdida real respecto a hoy.
- El aspecto de los sprites sale de los genes (color, forma): cosmético, no cognitivo.

---

## 2. El cerebro: una red por criatura

### 2.1 Arquitectura

Una **red de valor condicionada a la acción** (Q(s, a)): recibe el estado interno + contexto + una acción candidata y devuelve un número. Así maneja un número variable de candidatas (el repo ofrece 3-8 acciones, el bosque 6-8) con una sola red pequeña. Se evalúa una vez por candidata (≤ 9 evaluaciones por paso, microsegundos).

```
entrada  x ∈ ℝ^96
  │  capa 1: 96 → 48, tanh
  │  capa 2: 48 → 24, tanh
  ├─ cabeza Q         24 → 1    valor esperado de (s, a)        [Huber]
  ├─ cabeza mundo     24 → 2    P(éxito), recompensa esperada   [BCE + MSE]   ← curiosidad = su error
  └─ cabeza símbolos  24 → 17   valor de emitir cada símbolo / callar  [Huber, bandit contextual]
```

Parámetros: 96·48+48 = 4 656; 48·24+24 = 1 176; cabezas 25 + 50 + 425 = 500. **Total ≈ 6 330 parámetros** (float32 = 25 KB; en base64 ≈ 34 KB por criatura). Cabe en el "~40 KB" acordado.

Pesos iniciales: Xavier sembrado con el id de la criatura (dos fundadoras con la misma semilla nacerían iguales; nunca pasa porque el id lleva `seq`).

### 2.2 Entradas (percepción cruda, sin etiquetas de nadie)

Todo en [−1, 1], siempre el mismo orden. Con **hashing de rasgos** (feature hashing): cada token de un nombre se convierte en un índice de un vector de tamaño fijo con signo ±1 y se normaliza. La criatura no recibe "hongo rojo = peligroso"; recibe un patrón de bits que coincide cada vez que ve "hongo-rojo" y aprende sola qué le hace.

| bloque | dims | contenido |
|---|---|---|
| cuerpo | 8 | energía, aburrimiento, soledad, daño acumulado, edad/vida esperada, valencia, activación, sexo=0 (reservado) |
| rasgos | 6 | los seis rasgos actuales |
| entorno | 4 | one-hot repo / bosque / ciudad / cine (los nuevos entornos amplían el vector; es un cambio de formato versionado) |
| zona | 8 | hash de la zona (o carpeta, en el repo) + día/noche + comida presente + nº de criaturas en la zona (bucket) |
| acción: verbo | 12 | hash del tipo de acción (leer, comer, explorar…) |
| acción: objetivo | 24 | hash de tokens del objetivo (ruta, id de objeto, import) + extensión/tipo + profundidad |
| acción: historia propia | 6 | ok/fail propios sobre ese objetivo (del cursor), novedad estimada, ¿ya visitado?, creencia q y n para (objetivo, verbo) |
| oído | 20 | bolsa de símbolos oídos en esta zona desde el último tick (16) + ¿hubo señal del dios? + hace cuántos pasos + cuántas emisoras + ¿es pariente? |
| padre/cultura | 8 | reservado: hash del linaje y el símbolo más usado por su madre (para que la red pueda, si le sirve, distinguir voces) |

**Lo que NO entra, a propósito:** `riskHint`, `zone.danger`, la `p` oculta, ni ningún texto. Hoy `selectAction` usa `riskHint` (una pista del entorno): eso se acaba; el riesgo lo aprende de sus propios golpes.

En el repo, el `Outcome` sigue llevando `observation.text` (para la crónica y para tus hallazgos futuros), pero la red solo ve las señales: tokens de la ruta, tamaño en bucket, nº de imports, imports que resolvieron o no, ¿el archivo cambió desde la última vez?, ¿404?

### 2.3 Cómo entrena (online)

Un tick = K pasos (K = 3 por defecto, configurable). Al final del tick:

1. Retorno de cada paso `G_t = r_t + γ·r_{t+1} + γ²·r_{t+2}` (γ = 0.6, horizonte corto: el episodio es de tres pasos). `r` = recompensa del entorno + curiosidad (error de la cabeza mundo × curiosidad) − costo de emitir.
2. Por cada paso, **un paso de SGD** sobre (Huber(Q − G) + BCE(P(éxito), éxito real) + MSE(r̂, r)). Tasa de aprendizaje: **un gen** (`lrGen ∈ [0.003, 0.03]`). Recorte de gradiente por norma (≤ 1) para que una sola experiencia no la vuelva loca.
3. La cabeza de símbolos se entrena como bandit contextual: objetivo = recompensa social − costo (§6.3), solo para el símbolo elegido.
4. La experiencia `(x, G, éxito, r)` entra a un **anillo de memorias** de 150 (cuantizado a int8 → ≈ 19 KB en base64, dentro del documento de la criatura).

**Sueño (latido de las 03:00 Lima, una vez al día por criatura):** 2 pasadas sobre una muestra de 60 memorias (barajadas con RNG sembrado), mismo lr × 0.5. Es replay de experiencia: mitiga el olvido catastrófico cuando se muda de entorno. ≈ 120 pasos de SGD, milisegundos.

**Elección:** softmax sobre Q con temperatura `τ = τ_gen · (0.5 + curiosidad) · (1 − 0.6·madurez)`. Envejecer la vuelve más fija en sus mañas; la curiosidad la mantiene probando.

Escala esperada: 96 ticks/día × 3 pasos = **288 experiencias/día**, ~3 500 en una vida de 12 días. Una red de este tamaño aprende contingencias simples (evitar un objeto, preferir una zona, seguir imports que resuelven) con decenas de ejemplos; contingencias que dependen de dos cosas a la vez (de noche la piedra está fría) con cientos. No va a "entender" el código; va a aprender que ciertos patrones de ruta le dan fetch fallido.

### 2.4 Herencia de la red

La cría recibe `pesos_padre + N(0, σ)` con σ = 0.02 (gen mutable) y además un 3 % de pesos reinicializados. Con eso, la cría *ya sabe* casi todo lo que sabía el padre (incluidos sus errores) y tiene margen para desviarse. Es lamarckismo declarado: en biología los pesos no se heredan; aquí sí, porque tú lo decidiste y porque una vida de 12 días no alcanza para aprender desde cero cada generación.

### 2.5 Versionado del formato

`CerebroDoc.formato = 1` y `dims = [96, 48, 24]`. Si un día cambio las entradas (nuevo entorno), el documento con formato viejo se **migra** (se rellenan columnas nuevas con ceros) y queda en la crónica "Sisa despertó con un ojo nuevo". Nunca se descarta un cerebro por un cambio de formato.

---

## 3. Modelo de datos de la colonia

Una sola sociedad por despliegue (`colonia/principal`). Todos los de `MASCOTITA_OWNERS` son dioses de la misma. Si algún día quieres una por dueño, el id de colonia es un parámetro desde el día uno.

```
colonia/principal                          MundoDoc (~30-60 KB, 1 lectura por refresco de página)
  latido: { seq, lock: {until, seq} | null, lastAt, hoyKey, latidosHoy }
  dia:    { key, escrituras, lecturas, latidos }          ← contadores reales del día
  poblacion: { vivas, nacidas, muertas, generacionMax }
  fotos:  { cid → {nombre, gen, env, zona, energia, edad, etapa, ultimoSimbolo, simboloAt, viva, padre, tono} }  ≤ 40
  recursos: { "env/zona" → { comida, fuente: {porHora, hasta} | null } }
  zonas:  { env → [zonas abiertas] }
  senales: { "env/zona" → [ {de, sim, seq, dios: bool} ] }   ≤ 8 por zona, se vacían al latido siguiente
  pendientes: { cid → recompensaSocialAcumulada }
  rotacion: { cursor }                                         ← round-robin
colonia/principal/criaturas/{cid}          CriaturaDoc (~25-40 KB)
  identidad: cid, nombre, gen, padre, bornAt, diedAt, causaMuerte, viva
  genes: { 6 rasgos, lrGen, tauGen, sigmaGen, vidaGen }      ← lo que muta
  rasgos, mood, drives (energía, aburrimiento, soledad), dano, hambreTicks, edadTicks, xp, etapa
  env, zona, cursores: { repo: RepoCursor, bosque: ImaginedCursor, … }   (los de hoy, uno por entorno)
  creencias: { "objetivo|verbo" → {q, n, ultimo} }  ≤ 120 (se podan las de n bajo)
  memorias: { n, cursor, datos: base64 int8 }       ← anillo de 150 experiencias
  stats: { ticks, pasos, comidas, fallosGraves, emisiones, oidas, crias, recompensaMedia }
  ultimoTick: { seq, at, pasos: [{accion, objetivo, r, exito, simbolo}] }   ← lo que muestra la "mente"
  seq, lock
colonia/principal/cerebros/{cid}           CerebroDoc (~35 KB): formato, dims, pesos (base64 float32), pasos, perdida
colonia/principal/cronica/{YYYY-MM-DD}     CronicaDoc: eventos [{at, tipo, cid, texto, datos}] ≤ 400/día + omitidos
colonia/principal/lexico                   LexicoDoc: conteos enteros símbolo × contexto × consecuencia (§7)
colonia/principal/linaje                   LinajeDoc: [{cid, nombre, padre, gen, nacio, murio, causa}] ≤ 600
mascotita_cache/repoTree                   igual que hoy
```

Reglas que se mantienen: todo número o string plano (nada de `undefined`/`NaN`: `clean()`), ningún doc cerca de 1 MiB (el mayor es ~60 KB), ninguna consulta con índice compuesto (las únicas consultas son `where viva == true` y lecturas por id).

Los cerebros de las muertas se borran a los 7 días (su ficha queda en `criaturas` y en `linaje` para el árbol).

---

## 4. Ciclo de vida

**Tiempo.** Un latido cada 15 min → 96/día. Edad en ticks. Un día de vida real = 96 ticks.

**Energía (ahora sí es hambre).** `descansar` ya no regala +0.4: da +0.05. Comer da +0.35 por unidad y consume una unidad de `recursos[env/zona].comida`. Cada tick cuesta 0.02 + el costo de la acción. Fuentes naturales (config): arroyo y claro del bosque, mercado de la ciudad, y en el repo la "comida" es **novedad**: leer un archivo nunca leído o cambiado nutre (+0.15). El repo tiene ~800 archivos: se agota, y eso las empuja a migrar. Tú puedes dejar comida donde quieras (§8).

**Nacer.** Una criatura se reproduce sola cuando, en su tick, se cumplen TODAS:
- `edadTicks ≥ madurez` (200 ticks ≈ 2 días), `energia ≥ 0.75`, comida en su zona ≥ 2 unidades (las consume), `ticksDesdeUltimaCria ≥ 150`,
- `vivas < MAX_VIVAS` (12) y el presupuesto proyectado de mañana con una más cabe (§5).

La cría nace en la misma zona con energía 0.5, `gen = padre + 1`, nombre generado por sílabas con la semilla de su id, genes = padre + N(0, 0.05) (rasgos acotados a [0.05, 0.95]; genes de cerebro en sus rangos), pesos con ruido (§2.4), y las **12 creencias más firmes** del padre (por `n·|q|`) con `n` reducido a la mitad (las cree, pero menos que él). El padre paga energía −0.4. Todo va a la crónica y al linaje.

**Morir.**
- Vejez: `edadTicks > vidaGen` (gen en [900, 1 500] ticks ≈ 9-16 días).
- Hambre: `energia == 0` durante `≥ 24 ticks` seguidos (6 horas a cero).
- Fallos graves: cada paso con recompensa ≤ −0.6 suma `dano += 0.15`; sana 0.01 por tick; muere si `dano ≥ 1`.
Al morir: ficha marcada, cerebro programado para borrado, crónica, linaje. Sus señales pendientes se descartan.

**Extinción.** Si `vivas == 0`, se extinguieron y punto: no nace nadie solo. Queda el botón "Fundar" del dios (§8) para empezar otra vez cuando tú quieras; la crónica lo registra como intervención tuya.

**Dónde nacen.** La fundadora nace en un entorno y una zona al azar (RNG sembrado). Las crías nacen **junto a la madre** (misma zona): el lenguaje necesita co-presencia, las creencias heredadas hablan de cosas cercanas y la madre solo se reproduce donde hay comida. `config.NACIMIENTO = "junto-a-madre" | "aleatorio"` por si quieres comparar.

**Rasgos.** Se mantiene `driftTraits` con su tirón hacia los genes; los genes ahora mutan entre generaciones, así que lo que se "clava" en un individuo puede moverse en su linaje.

---

## 5. Presupuesto free-tier y cómo limita la población

Costos por latido con N vivas (Firestore cuenta documentos, no bytes):

| operación | lecturas | escrituras |
|---|---|---|
| mundo (candado en transacción + guardado final) | 1 | 2 |
| criaturas + cerebros de las que tocan tick | 2N | 2N |
| crónica del día, léxico, repoTree | 3 | 2 |
| nacimiento / muerte (extra) | 0 | +3 / +2 |
| **total con N = 12** | **28** | **28** |

Por día (96 latidos, N = 12): **≈ 2 700 escrituras y 2 700 lecturas**. Página: 1 lectura por refresco (solo `mundo`), +2 al tocar una criatura. Con la página abierta 6 h refrescando cada 20 s: ~1 100 lecturas. Total del día ≈ 3 900 lecturas / 2 800 escrituras: **19 % y 14 % de los topes gratis** (50 000 / 20 000). Vercel: 96 + ~200 invocaciones/día ≈ 9 000/mes de 100 000. Tiempo por latido (medido en la v1: tick sin LLM ≈ 100-300 ms; con un fetch al repo ≈ 1-2 s): 12 criaturas ≈ 5-15 s de los 60.

**Regla de nacimiento por presupuesto:** `proyeccion(N) = latidosDia × (2N + 4) + N × 0.3 (nacimientos/muertes) + lecturasPaginaEstimadas`. Nace una cría solo si `proyeccion(N+1) ≤ PRESUPUESTO_ESCRITURAS_DIA × 0.6` (12 000). Con estos números el presupuesto permitiría ~40 vivas; el tope duro `MAX_VIVAS = 12` manda antes, por tiempo de Vercel y por legibilidad del terrario. Todo esto se muestra en la UI: escrituras de hoy / tope, proyección de mañana, vivas / tope, y por qué no nace nadie ("sin presupuesto", "tope de vivas", "sin comida").

Contadores reales: `db.ts` cuenta cada lectura y escritura que hace y las suma en `mundo.dia`. Si un día llega al 90 % del tope, el latido pasa a **modo ahorro**: solo tickea la mitad de la población por latido (round-robin) hasta el cambio de día.

**Round-robin:** cada latido tickea hasta `MAX_TICKS_POR_LATIDO` (12) criaturas, empezando por `rotacion.cursor` ordenadas por `lastTickAt`. Con ≤ 12 vivas, todas viven cada 15 min; si permitiera más, se turnarían. El presupuesto de fetches al repo es **por latido** (6, con timeout de 4 s): las que estén en el repo lo reparten; quien no alcanza fetch lee el árbol cacheado (explorar carpetas no cuesta red).

---

## 6. Lenguaje emergente

### 6.1 El canal

16 símbolos discretos (`0..15`) con etiqueta de sílaba solo para mostrarlos (`ka ti mo su ra ne pi lo wa ki ta chu yu mi ño sa`) — las etiquetas son arbitrarias, nadie asigna significado. Una emisión = un símbolo por paso (o silencio, salida 16). Con K = 3 pasos, una criatura puede emitir hasta 3 por tick: secuencias cortas. Emitir cuesta `0.01` de energía.

Las señales se guardan en `mundo.senales["env/zona"]` (≤ 8, con `seq` del latido). **Oye** quien esté en la misma zona en ese latido o en el siguiente (las criaturas tickean en serie dentro del latido; la que va después ya oye a la de antes). Después se borran.

### 6.2 Quién habla y quién escucha

Emitir lo decide la cabeza de símbolos (bandit contextual sobre el estado). Escuchar no es una decisión: la bolsa "oído" entra a la red Q de quien la oye; si el patrón oído predice valor, la red lo usa; si no, lo ignora. **La única forma de que un símbolo signifique algo es que le sirva a la que lo oye para elegir mejor.**

### 6.3 La presión (diseñada, y dicha)

Para la oyente L en un tick con bolsa oída `h ≠ 0`:
1. Se calcula la acción que habría elegido **sin** la señal (misma red, `h = 0`): `a₀`. Y la real, con `h`: `a`.
2. Si `a ≠ a₀` (la señal cambió su decisión), tras actuar: `ventaja = G_real(a) − Q(s, a₀ | h=0)`, recortada a [−0.3, 0.3].
3. Cada emisora E cuyo símbolo estaba en `h` recibe `recompensaSocial += β·ventaja` (β = 0.8), acumulada en `mundo.pendientes[E]` y aplicada a su cabeza de símbolos en su siguiente tick. Una señal que hizo elegir peor a la oyente **castiga** a la emisora.
4. La oyente ya cobró su resultado real (eso es lo que la entrena a hacer caso). Te propongo `BONO_OYENTE = 0` por defecto: darle un extra por "haber sido influida" premiaría la obediencia y no el acierto. Si quieres el bono simétrico que describiste, es un número en config.

Esto es kin-selection de juguete escrito por mí: la emisora gana cuando ayuda a otra. Lo que no está escrito en ningún lado es qué símbolo, en qué contexto, ni si lo van a usar.

Hay presión de verdad porque hay **información asimétrica**: una veterana sabe (creencia) que el hongo rojo enferma; la cría recién nacida en la espesura no. Si la veterana emite "ta" con el hongo a la vista y la cría, al oír "ta", deja de comerlo, la veterana cobra. Otro caso: comida encontrada (la que emite al lado de la fruta y la otra va y come).

### 6.4 Riesgo honesto

- Que no emerja nada: probable en las primeras semanas. Con 8-12 criaturas y ~1 000 co-presencias/día, la recompensa social es rara y ruidosa. El medidor de la UI (§7) dirá "ruido" y yo prefiero eso a fingir.
- Que emerja "un poco": 1-3 símbolos con correlación estable con un contexto (peligro cerca, comida). Es mi expectativa realista a 1-2 meses.
- Que se pegue un símbolo por azar (todas emiten "ka" siempre porque una vez pagó): posible; el costo de emitir y el castigo por ventaja negativa lo contienen, no lo impiden.
- Co-presencia baja (cada una en su entorno): el drive de soledad ya existe (sube con horas sin otras cerca, baja al compartir zona) y entra a la red; si la red aprende que estar juntas reduce soledad, se juntan. Si no, no hay lenguaje y lo veremos.

---

## 7. El intérprete estadístico

`lexico` acumula, por cada emisión real (de criatura o tuya):

- **contexto** en el momento de emitir: entorno, zona, objetos a la vista (ids), ¿comida presente?, energía de la emisora (bajo/medio/alto), ¿tuvo un golpe (r ≤ −0.5) en sus últimos 2 pasos?, ¿cuántas otras en la zona?, ¿acababa de comer?
- **consecuencia** en los 2 pasos siguientes de cada oyente (y de la emisora): tipo de acción, ¿cambió de zona? (se fue / se quedó), signo de recompensa, ¿comió?, ¿se acercó al objeto nombrado?

Todo como conteos enteros: `lexico[sim][clave] = n` con `≤ 60` claves por símbolo (se podan las raras). Una glosa se calcula al pedirla:

- Ranking por **PMI** (información mutua puntual) y no por frecuencia bruta, para que un contexto común ("en el bosque") no aparezca como significado de todo.
- Texto honesto: `«ta» — 78 % con hongo rojo a la vista (n = 41, PMI 1.8) · después, quien oye se va de la zona 61 % (n = 33)`. Bajo n < 20: `«ta» — todavía sin datos suficientes (n = 6)`.
- **Medidor de lenguaje**: información mutua `I(símbolo; contexto)` en bits, y `I(símbolo; consecuencia de la oyente)`. Con la lectura al lado: < 0.1 bits = "ruido", 0.1-0.4 = "algo se repite", > 0.4 = "hay convención". Se calcula en el latido nocturno y se guarda en `lexico.resumen`.
- Bigramas: si en un tick salieron dos símbolos seguidos, se cuenta `ta-ka` como unidad también (≤ 40 bigramas).

**Tú hablas:** teclado de 16 teclas en el terrario; eliges zona (o la de la criatura que tocaste) y una secuencia de 1-3 símbolos. `POST /api/mascotita/decir` la deja en `mundo.senales` con `dios: true` y la registra en la crónica y en el léxico como emisión tuya. Las criaturas la procesan en su siguiente tick como cualquier señal: entra a la bolsa "oído" con el bit "dios" encendido (pueden aprender a distinguir tu voz, o no). Si tu señal les cambia la decisión y les va mejor, **tú** no cobras nada, pero el léxico registra la consecuencia: así aprendes si "ta" les hace irse.

---

## 8. Los recursos del dios

Rutas `POST /api/mascotita/dios/*` (solo dueños, sin tope, todo a la crónica con tu uid):

- `comida`: `{env, zona, unidades ≤ 20}` → suma a `recursos`.
- `fuente`: `{env, zona, porHora ∈ [0.1, 2], horas ≤ 168}` → regenera comida hasta un tope de 10 por zona; expira.
- `fundar` (solo si `vivas == 0`): una fundadora nueva, en un lugar al azar.
- Todo está abierto desde el día uno: cualquier entorno, cualquier zona. No hay ruta "abrir".

La regeneración natural (`config.RECURSOS_NATURALES`) es chica a propósito: arroyo 0.3/h, claro 0.2/h, mercado 0.4/h, tope 4 por zona. Con eso 4-6 criaturas viven sin ti; más de eso necesita tu comida, tus fuentes o migrar al repo. Es el freno "natural" de la población además de los topes.

---

## 9. Interfaz "terrario"

Ruta `/mascotita` reescrita. Tono propio, sin parecerse al resto de criteria. **Inspiración: Pokémon Esmeralda** (vista cenital de GBA, tiles de 16 px, paleta corta y saturada, cajas de diálogo con borde y esquinas, tipografía pixelada). Inspiración, no copia: todo es procedural (canvas 2D que dibuja sus propios tiles y sprites; sin assets externos, sin nombres ni gráficos de Nintendo).

**Vista principal (canvas, arriba, ocupa la pantalla en móvil):**
- Un mapa de tiles con cuatro regiones (entornos): pasto y árboles para el bosque, adoquín y edificios para la ciudad, butacas y pantalla para el cine, y "circuitos" para el repo; dentro, las zonas como parches con su letrero. Todo abierto.
- Criaturas como sprites de 14-20 px (forma de semilla con brotes según etapa, color por genes, un patrón de linaje: las de una misma madre comparten la marca). Se mueven con interpolación entre la zona anterior y la actual; al nacer aparecen al lado de la madre con un pulso; al morir se apagan y dejan un puntito por unos segundos.
- Burbuja con el símbolo cuando emiten (dura ~8 s en tu pantalla, con la sílaba). Comida: puntos ámbar en la zona; fuentes: un anillo que respira.
- Refresco: `GET /api/mascotita/mundo` cada 20 s (1 lectura). Si `latido.lastAt` tiene más de 25 min, la página dispara el **catch-up** (`POST /api/mascotita/latido` con tu sesión) y lo muestra como "latido manual".

**Paneles (pestañas abajo en móvil; columna derecha en escritorio):**
1. **Crónica**: log que corre (nacimientos, muertes, emisiones, comidas, golpes, tus intervenciones), filtrable por criatura o tipo. Del día actual y anteriores.
2. **Hablar**: el teclado de 16 símbolos + selector de zona + tus últimas emisiones con lo que pasó después.
3. **Léxico**: las 16 glosas ordenadas por n, el medidor de bits, bigramas.
4. **Linaje**: árbol genealógico SVG (generaciones en filas, vivas encendidas, causa de muerte al tocar).
5. **Recursos**: paleta (comida, fuente, abrir) y el panel de límites: escrituras hoy / tope, proyección, vivas / tope, latidos hoy, último latido, próximo estimado.
6. **Mente** (al tocar una criatura): energía, edad, etapa, ánimo; genes vs rasgos (reusa `traits-panel`); sus 10 creencias más firmes; su último tick paso a paso con la Q de cada candidata (para que veas *por qué* eligió); lo que oyó; una tira de 24 neuronas de la capa 2 iluminadas según su última activación; su madre y sus crías; botón "hablarle aquí".
7. **Narrador (Gemini, solo para ti)**: botón "Cuéntame qué pasó" que le pasa a Gemini la crónica, el léxico y las fichas (hechos y números) y te devuelve un resumen en español. Es de una sola vía: lo que escriba se guarda aparte (`colonia/principal/narraciones/{id}`), ninguna criatura lo lee ni lo recibe como señal, y no corrige las glosas del intérprete. Tope diario en `config.ts` (10). Usa `GEMINI_API_KEY` tal cual.

Móvil y escritorio: canvas `100vw × 55vh` en móvil con paneles debajo; en escritorio canvas a la izquierda (60 %) y paneles a la derecha.

---

## 10. El latido (GitHub Action) y el cron

`.github/workflows/latido.yml`:

```yaml
name: latido
on:
  schedule: [{ cron: "*/15 * * * *" }]
  workflow_dispatch:
jobs:
  latir:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - run: |
          curl -sS --fail --max-time 90 \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ vars.MASCOTITA_URL }}/api/mascotita/cron"
```

Tú configuras en GitHub: secret `CRON_SECRET` (el mismo de Vercel) y variable `MASCOTITA_URL` (`https://tu-dominio.vercel.app`). El endpoint es idempotente: si dos latidos se cruzan (Action + catch-up), el candado del mundo hace que uno espere.

`GET /api/mascotita/cron` (mismo secreto de hoy) = **un latido**: candado del mundo → lista de vivas → round-robin → ticks en serie con plazo por criatura (`min(6 s, restante/pendientes)`) → nacimientos/muertes → regeneración de recursos → lexico/crónica → suelta el candado. Plazo total 50 s. A las 03:00 Lima, el latido incluye el sueño y el resumen del léxico.

**Dos cosas de GitHub que debes saber:** (1) los crons programados se retrasan 3-15 min en horas pico y a veces se saltan; el latido usa el tiempo real transcurrido, no cuenta ticks perdidos. (2) GitHub **desactiva los workflows programados de un repo público tras 60 días sin commits**; el terrario te avisará si el último latido tiene más de 2 h, y el catch-up de la página + el cron diario de Vercel siguen como respaldo.

---

## 11. Migración y limpieza

- Todo empieza de cero: la fundadora nace nueva. Los datos viejos de `mascotas/{uid}` se borran en la fase 3 (autorizado).
- **Mudanza a tu máquina o a un servidor propio:** todo es TypeScript dentro de la app Next (red, backprop, latido, intérprete); nada en Python ni en servicios externos. Basta Node ≥ 20 con `next build && next start`, las mismas variables de entorno y algo que llame a `/api/mascotita/cron` cada 15 min (un cron de Linux con `curl`, o la misma Action apuntando a tu servidor). Lo único exclusivo de Vercel es `vercel.json`. La base sigue siendo Firestore; si un día la quieres local, la interfaz `Store` es el único lugar a reimplementar.
- `.env.local.example` y `web/README.md` (sección Mascotita) se reescriben en la fase 2.

---

## 12. Fases, orden y estimación

Cada fase: código + `npx tsc --noEmit` + `npx next build` + prueba de humo + commit en español + resumen. Nunca dos fases sin tu OK.

| # | fase | qué entrega | prueba de humo | tamaño |
|---|---|---|---|---|
| 1 | **Cerebro propio** | `nn.ts` (MLP + backprop a mano), `senales.ts` (hashing de rasgos), `creencias.ts`, tick sin LLM con la red eligiendo y entrenando, `db.ts` con interfaz `Store` + `store-memoria.ts`, borrado de Gemini/chat/teach de mascotita, página provisional (una sola criatura, sin terrario: estado, último tick con las Q, creencias, rasgos) | `web/scripts/humo.ts`: 2 000 ticks de una criatura en el bosque y en un repo simulado; verifica que la pérdida baja, que deja de comer el hongo rojo, que reintentos son idempotentes | ~2 000 líneas netas · ≈ 4 h |
| 2 | **Latido** | colonia/mundo, candado del mundo, round-robin, contadores reales de lecturas/escrituras, modo ahorro, catch-up de la página, GitHub Action, README | 30 días simulados de latidos con reloj falso; cuenta escrituras y falla si pasa el presupuesto | ≈ 2 h |
| 3 | **Sociedad** | varias criaturas, hambre y comida, reproducción con herencia (genes, pesos, creencias), muertes, linaje, crónica, presupuesto proyectado, fundadora migrada | 60 días simulados: población entre 3 y 12, hay nacimientos y muertes por las tres causas, el linaje es un árbol válido, ningún doc > 200 KB | ≈ 4 h |
| 4 | **Lenguaje e intérprete** | cabeza de símbolos, señales por zona, presión social, léxico con PMI y bits, teclado y `POST /decir` | 60 días simulados con un mundo donde señalar el peligro paga; se reporta I(símbolo; contexto) antes y después (si no sube, se dice) | ≈ 3 h |
| 5 | **Recursos** | rutas del dios, zonas cerradas/abiertas, fuentes con expiración, regeneración natural, crónica de intervenciones | intervenir en la simulación y verificar efectos y registro | ≈ 1.5 h |
| 6 | **Terrario** | canvas, sprites, burbujas, paneles, árbol, mente, paleta, límites; móvil y escritorio | manual (te paso capturas) + build | ≈ 5 h |

Total ≈ 20 h de mi trabajo, repartidas en las sesiones que hagan falta. Hasta la fase 6 verás una página provisional fea pero fiel (listas y números); si prefieres que el terrario básico llegue antes (después de la 3), se puede reordenar.

---

## 13. Riesgos y qué haré con cada uno

| riesgo | probabilidad | mitigación / postura |
|---|---|---|
| No emerge lenguaje | alta al inicio | medidor honesto en bits; presión ajustable en config (β, costo); mundos con información asimétrica real (peligros ocultos, comida). Si en 4 semanas I < 0.1 bits, lo decimos y ajustamos la presión, no el resultado |
| Colapso poblacional (la fundadora muere sin cría) | media | génesis automática o manual (pregunta A); madurez a 2 días y comida natural cerca del nacimiento |
| Estancamiento (todas descansan) | media | descansar ya no alimenta; curiosidad por error de predicción; hambre real |
| Explosión hasta el tope y hambruna cíclica | media | es dinámica de verdad y se verá en la crónica; la comida natural y tu intervención la regulan |
| Rasgos clavados | baja | tirón a genes + mutación por generación |
| Olvido catastrófico al mudarse de entorno | media | one-hot de entorno + replay nocturno; se mide la pérdida por entorno |
| Latido de GitHub retrasado o desactivado (60 días) | cierta a largo plazo | aviso en UI, catch-up al abrir, cron diario de Vercel |
| Tiempo de Vercel (60 s) con muchas en el repo | baja | presupuesto de fetches por latido, plazo por criatura, round-robin |
| Presupuesto Firestore | baja | contadores reales + proyección + modo ahorro + nacimiento condicionado |
| Un doc de criatura crece (cursores del repo con 400 rutas visitadas) | baja | topes actuales (`CAPS`) se mantienen; medido en la humo |

---

## 14. Decisiones tomadas sobre las preguntas abiertas

- **A.** Extinción final; botón "Fundar" para el dios.
- **B.** Todo desde cero; lo viejo se borra en la fase 3.
- **C.** Prueba de humo con `npx -y tsx scripts/humo.ts` (descarga puntual, como ya hace el README con `firebase-tools`; nada nuevo en `package.json`).
- **D.** `BONO_OYENTE = 0`.
- **E.** Todo abierto desde el día uno; fundadora en lugar aleatorio; crías junto a la madre (`NACIMIENTO` en config).
- **F.** Orden de fases tal cual. Terrario con estética tipo Pokémon Esmeralda y narrador Gemini (solo lectura para el dueño) en la fase 6.

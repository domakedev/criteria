# criteria

*[English version →](./README.md)*

**Un formato abierto y un motor de referencia para el criterio humano.**
Captura cómo deciden de verdad los humanos, en capas (comunidad ↔ personal),
consultable desde cualquier interfaz, y con ciclo cerrado por resultados
reales.

> Lee el [MANIFIESTO](./MANIFESTO.es.md). La versión corta: **primero el
> humano, la IA es opcional** — borra la IA y criteria sigue funcionando.

## La idea

Un humano con criterio no revisa todo lo que sabe. Ante una decisión, mira por
unas pocas **lentes** (puntos de vista: tiempo, impacto, relaciones, riesgo, su
propio cansancio…), elige las que importan, las pondera, decide — y le queda
una pequeña **duda** residual. Después, la realidad califica la decisión.

**criteria** guarda exactamente eso como un **Caso de Decisión**:

```
situación → lentes (peso + lectura) → decisión + motivo + duda
          → expectativa → resultado (el ciclo cerrado)
```

El motor nunca piensa. **Recupera y agrega** casos aportados por humanos,
siempre con procedencia. Los pesos no se configuran: **emergen** de las
decisiones que salieron bien.

## Empieza aquí — la app

Lo más simple: una app para escribir tus decisiones y aprender de ellas. Sin
jerga, sin nube. Tus experiencias se guardan como archivos en tu máquina.

```bash
npm install
npm run build
node dist/cli.js app          # abre http://localhost:4173 en tu navegador
```

Escribes qué viviste, qué decidiste y qué tomaste en cuenta; queda registrado.
Cuando sepas cómo salió, se lo cuentas y la app aprende de tu propio historial.

La pestaña "Pedir criterio" busca en tus experiencias **entendiendo el
significado** con IA local (transformers.js): la primera vez descarga un modelo
(~100MB) y después funciona sin internet. La IA solo *encuentra* tus
experiencias — nunca decide por ti. Si no está disponible, la búsqueda por
palabras (sinónimos, plurales, errores de tipeo) responde igual, al instante.

## Uso avanzado (CLI)

```bash
# Consulta tu propio criterio (vacío hasta que agregues casos — en frío te pide enseñarle)
node dist/cli.js ask --situation "¿refactorizo este módulo o entrego el ticket?" \
  --domain software-development --tags refactor,deadline

# Enséñale una decisión tuya (va a tu capa personal PRIVADA)
node dist/cli.js add \
  --situation "¿adoptar el framework X o seguir con vanilla?" \
  --domain software-development --tags framework,adopt \
  --lens "maintenance-cost:high:las actualizaciones del framework rompen cada año" \
  --lens "team-capacity:medium:solo yo conozco el framework X" \
  --decision "seguir con vanilla por ahora" \
  --reason "un bus factor de uno es demasiado caro" \
  --doubt medium \
  --expect "lo revisamos en dos trimestres"

# Después, cierra el ciclo
node dist/cli.js outcome <case-id> --status good --note "vanilla fue suficiente"

# Mira qué lentes han ganado peso en un dominio
node dist/cli.js lenses --domain software-development

# Historial del criterio almacenado
node dist/cli.js stats

# VE tu criterio — grafo interactivo estilo Obsidian, un archivo offline
node dist/cli.js graph --domain software-development
# → genera criteria-graph.html (autocontenido: ábrelo con doble clic)
# → o exporta el formato abierto de grafo para cualquier herramienta: criteria graph --json
```

Los agentes y otros programas consumen salida estructurada con `ask --json`.

## Estructura

```
spec/         El formato abierto (JSON Schemas + reglas de capas) — el producto real
src/          Motor de referencia en TypeScript (cero dependencias en runtime)
data/         community/ (compartido, con semilla) · personal/ (privado, gitignored)
interfaces/   Cómo CUALQUIER IA o dev construye una interfaz encima
docs/         Investigación y trasfondo
```

## Construye una interfaz

Web, móvil, reloj, voz, agente — lo que sea. El contrato del motor está en
[spec/SPEC.md §5](./spec/SPEC.md) y la guía paso a paso para IAs en
[interfaces/AI-IMPLEMENTATION-GUIDE.md](./interfaces/AI-IMPLEMENTATION-GUIDE.md).
Las seis reglas, en corto:

1. Nunca inventar juicio — responder solo desde casos almacenados.
2. Citar siempre la procedencia.
3. Los casos similares que salieron mal son **advertencias**, no sugerencias.
4. Reportar la confianza; arranque en frío = *"enséñame"*.
5. Ofrecer una forma de registrar resultados.
6. La IA puede estructurar el input; jamás sustituir el juicio humano.

## Aportar criterio

Un dominio es una carpeta bajo `data/community/`. Aporta casos por PR — cada
caso lleva su autor. Los casos personales solo se publican con un
`criteria promote <id>` explícito.

## Licencia

[MIT](./LICENSE) — libre para usar, conectar, guardar, forkear.

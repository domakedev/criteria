# Layers: community ↔ personal / Capas: comunidad ↔ personal

## Model / Modelo

```
┌─────────────────────────────────────────┐
│  COMMUNITY CRITERION                     │
│  shared · versioned · forkable           │
│  (git repos of case files per domain)    │
└──────────────────┬──────────────────────┘
                   │ inherit / subscribe / fork
                   ▼
┌─────────────────────────────────────────┐
│  PERSONAL CRITERION                      │
│  private · local-first · never published │
│  by default (gitignored)                 │
└──────────────────┬──────────────────────┘
                   ▼
        EFFECTIVE CRITERION
        community + personal
        (personal weighs more in scoring)
```

## Rules / Reglas

1. **Personal is private by default.** The reference layout gitignores
   `data/personal/`. Publishing personal criterion is an explicit, deliberate
   act (moving/promoting a case to the community layer).
   **ES:** Lo personal es privado por defecto; publicarlo es un acto explícito.

2. **Community is additive and attributed.** Every community case carries its
   `author`. Communities curate via normal open-source flows: PRs, review,
   forks. A domain (e.g. `medicine`, `carpentry`, `software-development`) is
   just a folder — anyone can create one.
   **ES:** La comunidad crece por PRs con autoría; un dominio es una carpeta.

3. **Personal outweighs community.** When the engine scores analogous cases,
   personal cases get a multiplier (reference: ×1.25). Your own lived criterion
   speaks louder than the crowd's — but the crowd is still heard.
   **ES:** Tu criterio vivido pesa más que el de la multitud, sin silenciarla.

4. **Derivation, not lock-in.** A personal criterion can start empty, start as
   a copy (fork) of a community domain, or grow by approving community cases
   into the personal layer. All three are first-class paths.
   **ES:** Puedes partir de cero, forkear la comunidad, o aprobar casos
   comunitarios hacia tu capa personal.

5. **Outcomes travel with cases.** A case's track record (expectation vs
   outcome) is part of the case. Forks inherit it; new outcomes recorded in
   your layer stay in your layer.

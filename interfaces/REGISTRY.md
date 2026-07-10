# Interface registry / Registro de interfaces

Any interface built on criteria — web, mobile, watch, voice, agent, product —
can be listed here via PR. Reference implementations live in this repo;
external products live in their own repos and just link back.

**Requirement to be listed:** comply with the engine contract
([spec/SPEC.md §5](../spec/SPEC.md)) and, if it renders the graph, with the
derivation rules ([spec/graph.md](../spec/graph.md)). The
[AI-IMPLEMENTATION-GUIDE](./AI-IMPLEMENTATION-GUIDE.md) is the step-by-step
contract.

**ES:** Cualquier interfaz construida sobre criteria se registra aquí por PR.
Requisito: cumplir el contrato del motor y, si dibuja el grafo, las reglas de
derivación. Los productos externos viven en sus propios repos y solo enlazan.

## Reference interfaces (this repo)

| Interface | Type | Where | Status |
|---|---|---|---|
| `criteria` CLI | terminal, human + agents (`--json`) | `src/cli.ts` | stable |
| Graph viewer | self-contained HTML file (`criteria graph`) | `src/viewer.ts` | stable |

## Community interfaces

| Interface | Type | Author | Where |
|---|---|---|---|
| *(add yours via PR)* | | | |

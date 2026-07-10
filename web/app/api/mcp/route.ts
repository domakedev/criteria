// POST /api/mcp — servidor MCP (Model Context Protocol) de criteria.
//
// Permite que una IA externa (Claude Code, Claude Desktop u otro cliente MCP
// por HTTP) use el criterio del usuario en su nombre:
//   · ask_criteria       → pregunta al criterio guardado (motor, nunca inventa)
//   · save_decision      → guarda una decisión ya conversada con la IA
//   · list_my_decisions  → lista sus decisiones y su historial
//
// Transporte: Streamable HTTP en su forma mínima (JSON-RPC 2.0 sobre POST,
// respuestas application/json, sin SSE). Autenticación: token personal
// "crit_…" en Authorization: Bearer — se genera en la pestaña "Conectar IA".
import { NextRequest, NextResponse } from "next/server";
import { ask, trackRecord } from "@/lib/engine";
import {
  createCase,
  firebaseAdminConfigured,
  listCommunityCases,
  listOwnCommunityCases,
  listPersonalCases,
  verifyMcpToken,
  type AuthedUser,
} from "@/lib/admin";
import { DOMAINS } from "@/lib/labels";
import {
  sanitizeDomain,
  sanitizeDoubt,
  sanitizeLenses,
  sanitizeScope,
} from "@/lib/validate";
import type { DecisionCase } from "@/lib/types";

const SUPPORTED_PROTOCOLS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const LATEST_PROTOCOL = "2025-06-18";
const DOMAIN_IDS = DOMAINS.map((d) => d.id);

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcMessage["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: RpcMessage["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

const TOOLS = [
  {
    name: "ask_criteria",
    description:
      "Pregunta al criterio guardado en criteria sobre una situación nueva. Devuelve SOLO experiencia humana real (casos con procedencia): qué pesó en situaciones parecidas, la decisión mejor respaldada y advertencias de lo que salió mal. Nada es inventado.",
    inputSchema: {
      type: "object",
      properties: {
        situation: {
          type: "string",
          description: "La situación o decisión que la persona enfrenta, en lenguaje natural.",
        },
        domain: {
          type: "string",
          enum: DOMAIN_IDS,
          description: "Tema para acotar la búsqueda (opcional).",
        },
        scope: {
          type: "string",
          enum: ["all", "mine", "community"],
          description:
            'Dónde buscar: "mine" solo en las decisiones del usuario, "community" solo en las compartidas, "all" en ambas (por defecto).',
        },
      },
      required: ["situation"],
    },
  },
  {
    name: "save_decision",
    description:
      "Guarda una decisión del usuario en criteria. Úsalo cuando la persona te cuente una decisión que tomó: ordena su relato en estos campos SIN inventar nada y confírmale antes de guardar. Por defecto queda privada.",
    inputSchema: {
      type: "object",
      properties: {
        situation: { type: "string", description: "Qué situación enfrentó, en sus palabras." },
        decision: { type: "string", description: "Qué decidió." },
        reason: { type: "string", description: "Por qué lo decidió." },
        doubt: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Cuánta duda tenía al decidir (low = casi seguro).",
        },
        expectation: { type: "string", description: "Qué espera que pase (opcional)." },
        domain: { type: "string", enum: DOMAIN_IDS, description: "Tema de la decisión." },
        lenses: {
          type: "array",
          description: "Qué pesó al decidir, solo si lo mencionó.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Qué miró, corto, kebab-case." },
              weight: { type: "string", enum: ["high", "medium", "low"] },
              reading: { type: "string", description: "Qué vio a través de ese lente." },
            },
            required: ["name", "weight", "reading"],
          },
        },
        share: {
          type: "boolean",
          description: "true para compartirla con la comunidad. Pregunta antes de activarlo.",
        },
        anonymous: {
          type: "boolean",
          description: "Con share=true, true la publica como “anónimo” en vez del nombre.",
        },
      },
      required: ["situation", "decision", "reason"],
    },
  },
  {
    name: "list_my_decisions",
    description:
      "Lista las decisiones guardadas del usuario (privadas y las que compartió) junto con su historial: cuántas salieron bien, mal o siguen pendientes.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(
  name: string,
  args: Record<string, unknown>,
  user: AuthedUser,
): Promise<unknown> {
  if (name === "ask_criteria") {
    const situation = typeof args.situation === "string" ? args.situation.trim() : "";
    if (!situation) throw new Error("Falta `situation`: la situación a consultar.");
    const scope = sanitizeScope(args.scope);
    const none = Promise.resolve<DecisionCase[]>([]);
    const [community, personal, ownShared] = await Promise.all([
      scope !== "mine" ? listCommunityCases() : none,
      scope !== "community" ? listPersonalCases(user.uid) : none,
      scope === "mine" ? listOwnCommunityCases(user.uid) : none,
    ]);
    const domain = typeof args.domain === "string" && args.domain ? { domain: args.domain } : {};
    return ask([...personal, ...ownShared, ...community], { situation, ...domain });
  }

  if (name === "save_decision") {
    const situation = typeof args.situation === "string" ? args.situation.trim() : "";
    const decision = typeof args.decision === "string" ? args.decision.trim() : "";
    const reason = typeof args.reason === "string" ? args.reason.trim() : "";
    if (!situation || !decision || !reason) {
      throw new Error("Faltan campos: situation, decision y reason son obligatorios.");
    }
    const share = args.share === true;
    const saved = await createCase(user.uid, {
      situation,
      decision,
      reason,
      doubt: sanitizeDoubt(args.doubt),
      ...(typeof args.expectation === "string" && args.expectation.trim()
        ? { expectation: args.expectation.trim() }
        : {}),
      context: { domain: sanitizeDomain(args.domain), tags: [] },
      lenses: sanitizeLenses(args.lenses),
      layer: share ? "community" : "personal",
      author: share && args.anonymous === true ? "anónimo" : user.name,
    });
    return {
      saved: true,
      id: saved.id,
      layer: saved.layer,
      author: saved.author,
      message:
        saved.layer === "community"
          ? `Decisión guardada y compartida con la comunidad como “${saved.author}”.`
          : "Decisión guardada en privado. Cuando se sepa cómo salió, ciérrala en la app.",
    };
  }

  if (name === "list_my_decisions") {
    const [personal, shared] = await Promise.all([
      listPersonalCases(user.uid),
      listOwnCommunityCases(user.uid),
    ]);
    const cases = [...personal, ...shared].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    return {
      record: trackRecord(cases),
      cases: cases.map((c) => ({
        id: c.id,
        situation: c.situation,
        decision: c.decision,
        reason: c.reason,
        domain: c.context.domain,
        outcome: c.outcome.status,
        ...(c.outcome.note ? { outcomeNote: c.outcome.note } : {}),
        shared: c.layer === "community",
        createdAt: c.createdAt,
      })),
    };
  }

  throw new Error(`Herramienta desconocida: ${name}`);
}

async function handleMessage(
  msg: RpcMessage,
  user: AuthedUser,
): Promise<Record<string, unknown> | null> {
  const { id, method, params } = msg;
  // Las notificaciones (sin id) no llevan respuesta.
  const isNotification = id === undefined || id === null;
  if (!method) return isNotification ? null : rpcError(id, -32600, "Falta `method`.");
  if (method.startsWith("notifications/")) return null;

  switch (method) {
    case "initialize": {
      const requested = String(params?.protocolVersion ?? "");
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "criteria", title: "criteria — criterio humano real", version: "0.2.0" },
        instructions:
          "criteria guarda decisiones humanas reales y responde SOLO con ellas. " +
          "Usa ask_criteria antes de aconsejar sobre una decisión; usa save_decision " +
          "cuando el usuario te cuente una decisión tomada (confírmale el resumen antes " +
          "de guardar y no inventes campos que no dijo).",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await callTool(name, args, user);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (err) {
        return rpcResult(id, {
          content: [
            { type: "text", text: err instanceof Error ? err.message : "Error al ejecutar la herramienta." },
          ],
          isError: true,
        });
      }
    }
    default:
      return isNotification ? null : rpcError(id, -32601, `Método no soportado: ${method}`);
  }
}

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(rpcError(null, -32000, "Servidor no configurado."), {
      status: 503,
    });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? await verifyMcpToken(token) : null;
  if (!user) {
    return NextResponse.json(
      rpcError(null, -32001, "Token inválido o revocado. Genera uno en criteria → Conectar IA."),
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "JSON inválido."), { status: 400 });
  }

  const messages = (Array.isArray(body) ? body : [body]) as RpcMessage[];
  const responses: Record<string, unknown>[] = [];
  for (const msg of messages) {
    const res = await handleMessage(msg, user);
    if (res) responses.push(res);
  }

  // Solo notificaciones: aceptado, sin cuerpo.
  if (responses.length === 0) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0]);
}

// Sin stream SSE: el cliente debe usar POST (Streamable HTTP mínimo).
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

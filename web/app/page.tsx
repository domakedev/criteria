// Landing pública. La comunidad se ve sin cuenta — el criterio compartido es
// de todos. Se renderiza en el servidor con el Admin SDK.
import Link from "next/link";
import { CaseCard } from "@/components/case-card";
import { firebaseAdminConfigured, listCommunityCases } from "@/lib/admin";
import type { DecisionCase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const configured = firebaseAdminConfigured();
  let community: DecisionCase[] = [];
  if (configured) {
    try {
      community = await listCommunityCases(12);
    } catch {
      // sin conexión a Firestore: la landing sigue funcionando
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <span className="text-lg font-bold tracking-tight text-emerald-900">
          criteria
        </span>
        <Link
          href="/login"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Entrar
        </Link>
      </header>

      <section className="py-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">
          Decide con experiencia real.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
          Anota tus decisiones, registra cómo salieron y consulta lo que a
          otras personas les funcionó de verdad. Sin humo:{" "}
          <strong className="text-stone-800">aquí nadie decide por ti</strong>.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-xl bg-emerald-700 px-6 py-3 font-medium text-white shadow-sm hover:bg-emerald-800"
        >
          Empezar gratis
        </Link>
      </section>

      <section className="grid gap-4 py-8 sm:grid-cols-3">
        {[
          {
            title: "1 · Anota",
            body: "Qué enfrentaste, qué decidiste, qué pesaste y por qué. Puedes dictarlo con tu voz.",
          },
          {
            title: "2 · Cierra el ciclo",
            body: "Cuando sepas cómo salió, cuéntalo. Así tu criterio gana peso con hechos, no con opiniones.",
          },
          {
            title: "3 · Consulta",
            body: "Ante una decisión nueva, mira qué pesó y qué funcionó en experiencias reales — tuyas y de la comunidad.",
          },
        ].map((s) => (
          <div
            key={s.title}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <h2 className="font-semibold text-emerald-900">{s.title}</h2>
            <p className="mt-2 text-sm text-stone-600">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="py-8">
        <h2 className="mb-4 text-xl font-bold text-stone-900">
          Lo último de la comunidad
        </h2>
        {!configured ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            El servidor aún no está conectado a Firebase. Sigue los pasos de{" "}
            <code>web/README.md</code> para configurarlo.
          </p>
        ) : community.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Todavía no hay experiencias compartidas. Sé la primera persona en
            aportar la tuya.
          </p>
        ) : (
          <div className="space-y-3">
            {community.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        criteria — formato abierto y libre (MIT). La IA solo ayuda a registrar;
        nunca reemplaza tu juicio.
      </footer>
    </main>
  );
}

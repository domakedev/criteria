// Landing pública, corta y directa: una promesa, cómo funciona en tres pasos
// y la comunidad real como prueba. Se renderiza en el servidor con el Admin SDK.
import Link from "next/link";
import { CaseCard } from "@/components/case-card";
import { Logo } from "@/components/logo";
import {
  EyeOffIcon,
  MicIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons";
import { firebaseAdminConfigured, listCommunityCases } from "@/lib/admin";
import type { DecisionCase } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    Icon: MicIcon,
    title: "Cuéntala y listo",
    body: "Escribe o dicta tu decisión como te salga. La IA la ordena — tú solo revisas y guardas.",
  },
  {
    Icon: EyeOffIcon,
    title: "Privada por defecto",
    body: "Nadie ve tus decisiones. Si compartes una, eliges: con tu nombre o en anónimo.",
  },
  {
    Icon: UsersIcon,
    title: "Respuestas con respaldo",
    body: "Lo que te muestra salió de experiencias reales, con su procedencia. Nada es inventado.",
  },
];

const STEPS = [
  { title: "Anota", body: "Qué enfrentaste, qué decidiste y por qué." },
  { title: "Cierra el ciclo", body: "Cuando sepas cómo salió, cuéntalo." },
  { title: "Consulta", body: "Ante una decisión nueva, mira qué funcionó de verdad." },
];

export default async function Landing() {
  const configured = firebaseAdminConfigured();
  let community: DecisionCase[] = [];
  if (configured) {
    try {
      community = await listCommunityCases(6);
    } catch {
      // sin conexión a Firestore: la landing sigue funcionando
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <Link
          href="/login"
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
        >
          Entrar
        </Link>
      </header>

      <section className="animate-rise py-12 text-center sm:py-16">
        <p className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-100">
          <SparklesIcon className="h-3.5 w-3.5" />
          La IA solo ordena — nunca decide por ti
        </p>
        <h1 className="mx-auto max-w-xl text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
          Decide con experiencia real,{" "}
          <span className="text-emerald-700">no con humo</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-stone-600">
          Anota tus decisiones, registra cómo salieron y consulta lo que a
          personas reales les funcionó de verdad.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-emerald-700 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Empezar gratis
          </Link>
          <a
            href="#comunidad"
            className="rounded-full px-4 py-3 font-medium text-stone-500 transition-colors hover:text-emerald-800"
          >
            Ver experiencias →
          </a>
        </div>
      </section>

      <section className="py-6">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="flex items-start gap-3 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-stone-900">{s.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-stone-500">
                  {s.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 py-6 sm:grid-cols-3">
        {FEATURES.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm"
          >
            <span className="inline-flex rounded-full bg-emerald-50 p-2.5 text-emerald-700">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-2.5 font-semibold text-stone-900">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">{body}</p>
          </div>
        ))}
      </section>

      <section id="comunidad" className="scroll-mt-6 py-8">
        <h2 className="mb-1 text-xl font-bold text-stone-900">
          Lo último de la comunidad
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          Decisiones reales, compartidas con nombre o en anónimo.
        </p>
        {!configured ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            El servidor aún no está conectado a Firebase. Sigue los pasos de{" "}
            <code>web/README.md</code> para configurarlo.
          </p>
        ) : community.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            Todavía no hay experiencias compartidas. Sé la primera persona en
            aportar la tuya — con tu nombre o en anónimo.
          </p>
        ) : (
          <div className="space-y-3">
            {community.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      <section className="my-6 rounded-2xl bg-emerald-900 px-6 py-10 text-center">
        <h2 className="text-2xl font-bold text-white">
          Tu criterio vale. Guárdalo.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-emerald-200">
          Gratis, formato abierto (MIT) y tus decisiones privadas siguen privadas.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-medium text-emerald-900 shadow-sm transition-colors hover:bg-emerald-50"
        >
          Crear mi cuenta gratis
        </Link>
      </section>

      <footer className="flex flex-col items-center gap-2 border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        <p>
          criteria — formato abierto y libre (MIT). La IA solo ayuda a
          registrar; nunca reemplaza tu juicio.
        </p>
        <p>
          <a
            href="https://github.com/domakedev/criteria"
            className="underline-offset-2 hover:text-emerald-800 hover:underline"
          >
            Código abierto en GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}

// Landing pública. La comunidad se ve sin cuenta — el criterio compartido es
// de todos. Se renderiza en el servidor con el Admin SDK.
import Link from "next/link";
import { CaseCard } from "@/components/case-card";
import { Logo } from "@/components/logo";
import {
  BoltIcon,
  EyeOffIcon,
  MicIcon,
  SparklesIcon,
} from "@/components/icons";
import { firebaseAdminConfigured, listCommunityCases } from "@/lib/admin";
import type { DecisionCase } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    Icon: SparklesIcon,
    title: "Cuéntalo y listo",
    body: "Escribe o dicta tu decisión como te salga. La IA la ordena en segundos — tú solo revisas y guardas. Nada de formularios pesados.",
  },
  {
    Icon: MicIcon,
    title: "Con tu voz",
    body: "Dictado integrado en cada campo. Anota una decisión mientras caminas, sin teclear una letra.",
  },
  {
    Icon: EyeOffIcon,
    title: "Con tu nombre o en anónimo",
    body: "Cada decisión es privada por defecto. Si la compartes, tú eliges: con tu nombre o como “anónimo”. Tu correo nunca se muestra.",
  },
  {
    Icon: BoltIcon,
    title: "Tu IA, conectada (MCP)",
    body: "Servidor MCP integrado: Claude u otra IA compatible consulta tu criterio antes de aconsejarte y guarda decisiones por ti desde el chat.",
  },
];

const STEPS = [
  {
    title: "Anota",
    body: "Qué enfrentaste, qué decidiste y por qué. Lo cuentas con tus palabras — texto o voz — y la IA lo deja ordenado.",
  },
  {
    title: "Cierra el ciclo",
    body: "Cuando sepas cómo salió, cuéntalo. Así tu criterio gana peso con hechos, no con opiniones.",
  },
  {
    title: "Consulta",
    body: "Ante una decisión nueva, mira qué pesó y qué funcionó en experiencias reales — solo tuyas, de la comunidad o ambas.",
  },
];

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
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="flex items-center gap-4">
          <a
            href="#comunidad"
            className="hidden text-sm font-medium text-stone-600 hover:text-emerald-800 sm:inline"
          >
            Comunidad
          </a>
          <Link
            href="/login"
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Entrar
          </Link>
        </nav>
      </header>

      <section className="animate-rise py-14 text-center sm:py-20">
        <p className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-900">
          <SparklesIcon className="h-3.5 w-3.5" />
          Experiencia humana real · la IA solo ordena, nunca decide
        </p>
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
          Decide con experiencia real,{" "}
          <span className="text-emerald-700">no con humo</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
          Cuenta tus decisiones con tu voz o por escrito — la IA las ordena por
          ti. Registra cómo salieron y consulta lo que a personas reales les
          funcionó de verdad. <strong className="text-stone-800">Aquí nadie decide por ti.</strong>
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-emerald-700 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Empezar gratis
          </Link>
          <a
            href="#comunidad"
            className="rounded-xl border border-stone-300 bg-white px-6 py-3 font-medium text-stone-700 transition-colors hover:border-emerald-600 hover:text-emerald-800"
          >
            Ver experiencias
          </a>
        </div>
        <p className="mt-5 text-xs text-stone-400">
          Gratis · Formato abierto (MIT) · Tus decisiones privadas siguen privadas
        </p>
      </section>

      <section className="grid gap-4 py-8 sm:grid-cols-2">
        {FEATURES.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex rounded-xl bg-emerald-100 p-2.5 text-emerald-800">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-semibold text-stone-900">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{body}</p>
          </div>
        ))}
      </section>

      <section className="py-10">
        <h2 className="mb-6 text-center text-2xl font-bold text-stone-900">
          Cómo funciona
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl border border-stone-200 bg-white p-6"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-emerald-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="my-8 rounded-2xl bg-emerald-900 px-6 py-10 text-center sm:px-10">
        <p className="mx-auto max-w-2xl text-lg leading-relaxed font-medium text-emerald-50 sm:text-xl">
          “La IA solo ayuda a registrar y a leer lo que la gente vivió.
          Nunca inventa, nunca opina por su cuenta, nunca reemplaza tu juicio.”
        </p>
        <p className="mt-3 text-sm text-emerald-300">— el manifiesto de criteria</p>
      </section>

      <section id="comunidad" className="scroll-mt-6 py-8">
        <h2 className="mb-4 text-xl font-bold text-stone-900">
          Lo último de la comunidad
        </h2>
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

      <section className="py-10 text-center">
        <h2 className="text-2xl font-bold text-stone-900">
          Tu criterio vale. Guárdalo.
        </h2>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-emerald-700 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
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

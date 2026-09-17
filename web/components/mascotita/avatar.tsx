// Avatar 100 % procedural (SVG, sin assets): una semillita cuyo color sale de
// su personalidad, cuyos ojos siguen su ánimo y su energía, y que echa brotes
// con cada etapa. El huevo es el mismo componente con `pet === null` o
// etapa "huevo". El fondo cambia con el entorno donde vive.
import type { LifeStage, PetView } from "@/lib/mascotita/types";

const STAGE_SCALE: Record<LifeStage, number> = {
  huevo: 1,
  cria: 0.72,
  joven: 0.86,
  adulta: 1,
  sabia: 1.06,
};

const SPROUTS: Record<LifeStage, number> = { huevo: 0, cria: 1, joven: 2, adulta: 3, sabia: 3 };

export function Avatar({
  pet,
  size = 160,
  className = "",
}: {
  pet: PetView | null;
  /** lado del cuadro (px); el cuadro es fijo para que no salte el layout */
  size?: number;
  className?: string;
}) {
  const stage: LifeStage = pet?.stage ?? "huevo";
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-2xl ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <Background env={pet?.env ?? ""} />
        {stage === "huevo" || !pet ? <Egg /> : <Creature pet={pet} />}
      </svg>
    </div>
  );
}

// --- fondos por entorno ---

function Background({ env }: { env: string }) {
  const id = env.toLowerCase();
  if (id === "repo") {
    return (
      <>
        <defs>
          <pattern id="mz-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="7" cy="7" r="1.2" fill="#a8a29e" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="200" height="200" fill="#fafaf9" />
        <rect width="200" height="200" fill="url(#mz-dots)" />
      </>
    );
  }
  if (id.includes("bosque")) {
    return (
      <>
        <defs>
          <linearGradient id="mz-bosque" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d1fae5" />
            <stop offset="1" stopColor="#a7f3d0" />
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#mz-bosque)" />
        <polygon points="18,150 38,96 58,150" fill="#6ee7b7" opacity="0.8" />
        <polygon points="150,150 172,88 194,150" fill="#6ee7b7" opacity="0.8" />
        <ellipse cx="100" cy="176" rx="110" ry="26" fill="#86efac" opacity="0.6" />
      </>
    );
  }
  if (id.includes("ciudad")) {
    return (
      <>
        <rect width="200" height="200" fill="#e2e8f0" />
        <rect x="10" y="90" width="26" height="80" fill="#cbd5e1" />
        <rect x="42" y="70" width="20" height="100" fill="#b9c4d3" />
        <rect x="150" y="80" width="24" height="90" fill="#cbd5e1" />
        <rect x="178" y="100" width="16" height="70" fill="#b9c4d3" />
        <rect y="168" width="200" height="32" fill="#94a3b8" opacity="0.5" />
      </>
    );
  }
  if (id.includes("cine")) {
    return (
      <>
        <rect width="200" height="200" fill="#1c1917" />
        <polygon points="0,0 200,70 200,150 0,40" fill="#fde68a" opacity="0.14" />
        <rect y="168" width="200" height="32" fill="#292524" />
      </>
    );
  }
  return <rect width="200" height="200" fill="#f5f5f4" />;
}

// --- huevo ---

function Egg() {
  return (
    <g>
      <ellipse cx="100" cy="176" rx="46" ry="8" fill="#000" opacity="0.08" />
      <ellipse cx="100" cy="112" rx="44" ry="58" fill="#c89b6d" stroke="#a97c4f" strokeWidth="2" />
      <circle cx="84" cy="90" r="5" fill="#a97c4f" opacity="0.7" />
      <circle cx="116" cy="104" r="4" fill="#a97c4f" opacity="0.7" />
      <circle cx="92" cy="132" r="6" fill="#a97c4f" opacity="0.6" />
      <circle cx="118" cy="140" r="3" fill="#a97c4f" opacity="0.6" />
      <circle cx="106" cy="76" r="3" fill="#a97c4f" opacity="0.6" />
      <ellipse cx="86" cy="78" rx="8" ry="14" fill="#fff" opacity="0.28" />
    </g>
  );
}

// --- criatura ---

function Creature({ pet }: { pet: PetView }) {
  const t = pet.traits;
  const hue = 150 + 60 * (t.juego - t.cautela);
  const sat = 55 + 30 * t.curiosidad;
  const body = `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 58%)`;
  const dark = `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 40%)`;
  const light = `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 72%)`;

  const { valence, arousal, word } = pet.mood;
  const sleepy = pet.drives.energy < 0.3;
  const opening = 0.5 + 0.5 * arousal;
  const eyeRy = sleepy ? 1.2 : 3 + 6 * opening;
  const bigPupil = word === "curiosa" || word === "inquieta";
  const pupilR = bigPupil ? 4 : 2.6;
  const happy = valence > 0.3;
  const sad = valence < -0.3;
  const blush = word === "alegre" || word === "orgullosa";
  const scale = STAGE_SCALE[pet.stage];
  const sprouts = SPROUTS[pet.stage];
  const flower = pet.stage === "adulta" || pet.stage === "sabia";
  const halo = pet.stage === "sabia";

  return (
    <g>
      <ellipse cx="100" cy="176" rx={44 * scale} ry="7" fill="#000" opacity="0.08" />
      <g transform={`translate(100 120) scale(${scale}) translate(-100 -120)`}>
        {halo ? (
          <ellipse
            cx="100"
            cy="30"
            rx="30"
            ry="7"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
            opacity="0.7"
          />
        ) : null}

        {/* brotes en la cabeza: 1 cría · 2 joven · 3 adulta (+ florcita) · sabia (+ halo) */}
        {Array.from({ length: sprouts }, (_, i) => {
          const dx = sprouts === 1 ? 0 : (i - (sprouts - 1) / 2) * 12;
          const tilt = dx * 1.6;
          return (
            <g key={i} transform={`translate(${100 + dx} 48) rotate(${tilt})`}>
              <path d="M0 0 C 1 -8 -1 -14 0 -20" stroke={dark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <ellipse cx="4" cy="-16" rx="6" ry="3.2" fill="#4ade80" transform="rotate(-30 4 -16)" />
            </g>
          );
        })}
        {flower ? (
          <g transform="translate(100 26)">
            {[0, 72, 144, 216, 288].map((a) => (
              <circle
                key={a}
                cx={Math.cos((a * Math.PI) / 180) * 4}
                cy={Math.sin((a * Math.PI) / 180) * 4}
                r="3"
                fill="#fbcfe8"
              />
            ))}
            <circle r="2" fill="#f59e0b" />
          </g>
        ) : null}

        {/* cuerpo: una gota/semilla */}
        <path
          d="M100 44 C 138 62 152 108 134 150 C 120 178 80 178 66 150 C 48 108 62 62 100 44 Z"
          fill={body}
          stroke={dark}
          strokeWidth="2"
        />
        <ellipse cx="84" cy="84" rx="10" ry="16" fill={light} opacity="0.5" transform="rotate(20 84 84)" />

        {/* ojos */}
        <Eye cx={86} cy={108} ry={eyeRy} pupilR={pupilR} happy={happy} sad={sad} lid={body} sleepy={sleepy} />
        <Eye cx={114} cy={108} ry={eyeRy} pupilR={pupilR} happy={happy} sad={sad} lid={body} sleepy={sleepy} />

        {blush ? (
          <>
            <circle cx="76" cy="122" r="5" fill="#fb7185" opacity="0.35" />
            <circle cx="124" cy="122" r="5" fill="#fb7185" opacity="0.35" />
          </>
        ) : null}

        {/* boca: curva según valencia */}
        <path
          d={`M92 130 Q100 ${130 + 9 * Math.max(-1, Math.min(1, valence))} 108 130`}
          stroke={dark}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {sleepy ? (
        <text x="140" y="62" fontSize="15" fontWeight="700" fill="#78716c" fontFamily="ui-sans-serif, system-ui">
          zzz
        </text>
      ) : null}
    </g>
  );
}

function Eye({
  cx,
  cy,
  ry,
  pupilR,
  happy,
  sad,
  lid,
  sleepy,
}: {
  cx: number;
  cy: number;
  ry: number;
  pupilR: number;
  happy: boolean;
  sad: boolean;
  lid: string;
  sleepy: boolean;
}) {
  const rx = 6.5;
  if (sleepy) {
    return <path d={`M${cx - rx} ${cy} Q${cx} ${cy + 3} ${cx + rx} ${cy}`} stroke="#292524" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" stroke="#292524" strokeWidth="1.5" />
      <circle cx={cx} cy={cy + Math.min(2, ry * 0.2)} r={Math.min(pupilR, ry)} fill="#292524" />
      <circle cx={cx - 1.5} cy={cy - Math.min(2, ry * 0.3)} r="1" fill="#fff" />
      {/* párpado ∪ (contento: el inferior sube) · ∩ (triste: el superior cae) */}
      {happy ? (
        <ellipse cx={cx} cy={cy + ry * 1.1} rx={rx + 1} ry={ry * 0.7} fill={lid} />
      ) : null}
      {sad ? <ellipse cx={cx} cy={cy - ry * 1.05} rx={rx + 1} ry={ry * 0.7} fill={lid} /> : null}
      {happy || sad ? (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#292524" strokeWidth="1.5" />
      ) : null}
    </g>
  );
}

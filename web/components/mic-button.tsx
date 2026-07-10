"use client";

// Dictado por voz con la Web Speech API del navegador (reconocimiento local
// del sistema, sin IA externa: nada sale hacia ningún modelo). Patrón tomado
// de contar-calorias, simplificado: un botón que alterna grabar/detener y va
// entregando el texto reconocido.
import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  /** Recibe el texto dictado (completo, final + provisional) en vivo. */
  onText: (text: string) => void;
  className?: string;
}

export function MicButton({ onText, className = "" }: Props) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<any>(null);
  // texto final acumulado; persiste aunque la API reinicie por un silencio
  const finalRef = useRef("");
  // base de texto final al (re)crear la instancia, para no duplicar en desktop
  const finalsBase = useRef("");
  // el usuario tocó "Detener": no reanudar en onend
  const stoppingRef = useRef(false);
  const unmountedRef = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const w = window as any;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      unmountedRef.current = true;
      try {
        recRef.current?.stop();
      } catch {}
    };
  }, []);

  const start = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    // Chrome en Android entrega e.results acumulativo (cada item trae TODO lo
    // dicho); concatenar como en desktop duplicaría cada frase
    const isAndroid = /android/i.test(navigator.userAgent);

    const build = () => {
      const rec = new SR();
      rec.lang = "es-PE";
      // en Android continuous=true agrava la duplicación (bug conocido de
      // Chrome): frase por frase y onend reanuda solo
      rec.continuous = !isAndroid;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let finals = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        if (isAndroid) {
          // acumulativo: el último resultado ya trae todo lo de esta instancia
          const last = e.results[e.results.length - 1];
          if (last.isFinal) {
            finalRef.current += last[0].transcript + " ";
            interim = "";
          } else {
            interim = last[0].transcript;
          }
        } else if (finals) {
          finalRef.current = finalsBase.current + finals;
        }
        onTextRef.current((finalRef.current + interim).trim());
      };

      rec.onend = () => {
        if (unmountedRef.current || stoppingRef.current) {
          setRecording(false);
          return;
        }
        // silencio: reanudar con una instancia nueva (reusar la misma
        // duplicaría lo ya dictado)
        finalsBase.current = finalRef.current;
        recRef.current = build();
        try {
          recRef.current.start();
        } catch {
          setRecording(false);
        }
      };

      rec.onerror = () => {};
      return rec;
    };

    finalRef.current = "";
    finalsBase.current = "";
    stoppingRef.current = false;
    recRef.current = build();
    recRef.current.start();
    setRecording(true);
  };

  const stop = () => {
    stoppingRef.current = true;
    try {
      recRef.current?.stop();
    } catch {}
    setRecording(false);
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        recording
          ? "bg-red-600 text-white animate-pulse"
          : "bg-stone-200 text-stone-700 hover:bg-stone-300"
      } ${className}`}
      aria-label={recording ? "Detener dictado" : "Dictar con la voz"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z" />
      </svg>
      {recording ? "Detener" : "Dictar"}
    </button>
  );
}

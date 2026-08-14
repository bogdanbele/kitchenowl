import { useCallback, useEffect, useRef, useState } from "react";
import type { Timer } from "../lib/cooking";

export interface RunningTimer {
  id: number;
  note: string;
  endsAt: number;
  remaining: number;
  rung: boolean;
}

/**
 * Kitchen timers that survive a hidden tab.
 *
 * Countdowns are stored as an **end time**, not a decremented number: browsers
 * throttle timers in background tabs to once a minute, so a counter that
 * subtracts a second per tick loses minutes while you are reading a message —
 * which for a pan of onions is the whole point of the timer.
 */
export function useTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  const ring = useCallback((note: string) => {
    // A short two-tone chime built in the browser, so there is no audio file to
    // ship and nothing to fail to load.
    try {
      audioRef.current ??= new AudioContext();
      const context = audioRef.current;
      void context.resume();
      [880, 1320].forEach((frequency, step) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        const at = context.currentTime + step * 0.28;
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.3);
      });
    } catch {
      // Audio blocked until a gesture, or unsupported. The visible alarm stays.
    }

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Timer finished", { body: note, tag: `kitchenowl-${note}` });
    }
    // A phone in a pocket beats a chime in a noisy kitchen.
    navigator.vibrate?.([200, 100, 200]);
  }, []);

  const start = useCallback((timer: Timer, note: string) => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setTimers((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        note: `${note} · ${timer.label}`,
        endsAt: Date.now() + timer.seconds * 1000,
        remaining: timer.seconds,
        rung: false,
      },
    ]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setTimers((current) => current.filter((timer) => timer.id !== id));
  }, []);

  useEffect(() => {
    if (timers.length === 0) return;
    const tick = setInterval(() => {
      setTimers((current) =>
        current.map((timer) => {
          const remaining = Math.round((timer.endsAt - Date.now()) / 1000);
          if (remaining <= 0 && !timer.rung) {
            ring(timer.note);
            return { ...timer, remaining: 0, rung: true };
          }
          return { ...timer, remaining };
        }),
      );
    }, 500);
    return () => clearInterval(tick);
  }, [timers.length, ring]);

  return { timers, start, dismiss };
}

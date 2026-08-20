"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

import { demoSportOrder, demoSports, type SportDemo } from "@/components/landing-athlete-data";
import type { Sport } from "@/lib/sports";

type LandingExperienceContextValue = {
  selectedSport: Sport;
  sportIndex: number;
  sportOrder: readonly Sport[];
  athlete: SportDemo["athlete"];
  snapshot: SportDemo;
  pauseRotation: () => void;
  resumeRotation: () => void;
  setSport: (sport: Sport) => void;
  goToNextSport: () => void;
  goToPreviousSport: () => void;
  direction: number;
  progress: number;
  reducedMotion: boolean;
};

const LandingExperienceContext = createContext<LandingExperienceContextValue | null>(null);
const AUTOPLAY_MS = 6400;
const TICK_MS = 80;

export function LandingExperienceProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [sportIndex, setSportIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedSport = demoSportOrder[sportIndex] ?? demoSportOrder[0];
  const snapshot = demoSports[selectedSport];

  useEffect(() => {
    if (paused || reducedMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = current + TICK_MS / AUTOPLAY_MS;

        if (next < 1) {
          return next;
        }

        setDirection(1);
        setSportIndex((value) => (value + 1) % demoSportOrder.length);
        return 0;
      });
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [paused, reducedMotion]);

  const value = useMemo<LandingExperienceContextValue>(
    () => ({
      selectedSport,
      sportIndex,
      sportOrder: demoSportOrder,
      athlete: snapshot.athlete,
      snapshot,
      pauseRotation: () => setPaused(true),
      resumeRotation: () => setPaused(false),
      setSport: (sport) => {
        const index = demoSportOrder.indexOf(sport);

        if (index === -1) {
          return;
        }

        setDirection(index > sportIndex ? 1 : -1);
        setSportIndex(index);
        setProgress(0);
      },
      goToNextSport: () => {
        setDirection(1);
        setSportIndex((current) => (current + 1) % demoSportOrder.length);
        setProgress(0);
      },
      goToPreviousSport: () => {
        setDirection(-1);
        setSportIndex((current) => (current - 1 + demoSportOrder.length) % demoSportOrder.length);
        setProgress(0);
      },
      direction,
      progress,
      reducedMotion,
    }),
    [direction, progress, reducedMotion, selectedSport, snapshot, sportIndex],
  );

  return <LandingExperienceContext.Provider value={value}>{children}</LandingExperienceContext.Provider>;
}

export function useLandingExperience() {
  const context = useContext(LandingExperienceContext);

  if (!context) {
    throw new Error("useLandingExperience must be used inside LandingExperienceProvider");
  }

  return context;
}

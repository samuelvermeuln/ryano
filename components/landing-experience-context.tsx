"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { athletes, sportOrder, type Athlete, type Sport } from "@/components/landing-athlete-data";

type LandingExperienceContextValue = {
  athleteIndex: number;
  athlete: Athlete;
  selectedSport: Sport;
  pauseRotation: () => void;
  resumeRotation: () => void;
  setSport: (sport: Sport) => void;
  goToAthlete: (nextIndex: number) => void;
  goToNextAthlete: () => void;
  goToPreviousAthlete: () => void;
  direction: number;
  sportOrder: readonly Sport[];
};

const LandingExperienceContext = createContext<LandingExperienceContextValue | null>(null);

export function LandingExperienceProvider({ children }: { children: ReactNode }) {
  const [athleteIndex, setAthleteIndex] = useState(0);
  const [selectedSport, setSelectedSport] = useState<Sport>("run");
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return;
    }

    const interval = window.setInterval(() => {
      setDirection(1);
      setAthleteIndex((current) => (current + 1) % athletes.length);
    }, 4600);

    return () => window.clearInterval(interval);
  }, [paused]);

  const value = useMemo<LandingExperienceContextValue>(() => ({
    athleteIndex,
    athlete: athletes[athleteIndex],
    selectedSport,
    pauseRotation: () => setPaused(true),
    resumeRotation: () => setPaused(false),
    setSport: (sport) => setSelectedSport(sport),
    goToAthlete: (nextIndex) => {
      setDirection(nextIndex > athleteIndex ? 1 : -1);
      setAthleteIndex(nextIndex);
    },
    goToNextAthlete: () => {
      setDirection(1);
      setAthleteIndex((current) => (current + 1) % athletes.length);
    },
    goToPreviousAthlete: () => {
      setDirection(-1);
      setAthleteIndex((current) => (current - 1 + athletes.length) % athletes.length);
    },
    direction,
    sportOrder,
  }), [athleteIndex, direction, selectedSport]);

  return <LandingExperienceContext.Provider value={value}>{children}</LandingExperienceContext.Provider>;
}

export function useLandingExperience() {
  const context = useContext(LandingExperienceContext);

  if (!context) {
    throw new Error("useLandingExperience must be used inside LandingExperienceProvider");
  }

  return context;
}

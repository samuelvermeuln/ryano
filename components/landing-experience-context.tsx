"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { athletes, sportOrder, type Athlete, type Sport } from "@/components/landing-athlete-data";

type LandingExperienceContextValue = {
  athleteIndex: number;
  athlete: Athlete;
  athletes: readonly Athlete[];
  selectedSport: Sport;
  availableSports: readonly Sport[];
  pauseRotation: () => void;
  resumeRotation: () => void;
  setSport: (sport: Sport) => void;
  goToAthlete: (nextIndex: number) => void;
  goToNextAthlete: () => void;
  goToPreviousAthlete: () => void;
  direction: number;
  progress: number;
  sportOrder: readonly Sport[];
};

const LandingExperienceContext = createContext<LandingExperienceContextValue | null>(null);
const AUTOPLAY_MS = 5200;
const TICK_MS = 80;

export function LandingExperienceProvider({ children }: { children: ReactNode }) {
  const [athleteIndex, setAthleteIndex] = useState(0);
  const [selectedSport, setSelectedSport] = useState<Sport>(athletes[0].defaultSport);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const athlete = athletes[athleteIndex];
  const availableSports = sportOrder.filter((sport) => Boolean(athlete.sports[sport]));
  const activeSport = athlete.sports[selectedSport] ? selectedSport : athlete.defaultSport;

  useEffect(() => {
    if (paused) {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = current + TICK_MS / AUTOPLAY_MS;

        if (next < 1) {
          return next;
        }

        setDirection(1);
        setAthleteIndex((value) => (value + 1) % athletes.length);
        return 0;
      });
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [paused]);

  const value = useMemo<LandingExperienceContextValue>(() => ({
    athleteIndex,
    athlete,
    athletes,
    selectedSport: activeSport,
    availableSports,
    pauseRotation: () => setPaused(true),
    resumeRotation: () => setPaused(false),
    setSport: (sport) => {
      if (!athlete.sports[sport]) {
        return;
      }

      setSelectedSport(sport);
      setProgress(0);
    },
    goToAthlete: (nextIndex) => {
      setDirection(nextIndex > athleteIndex ? 1 : -1);
      setAthleteIndex(nextIndex);
      setProgress(0);
    },
    goToNextAthlete: () => {
      setDirection(1);
      setAthleteIndex((current) => (current + 1) % athletes.length);
      setProgress(0);
    },
    goToPreviousAthlete: () => {
      setDirection(-1);
      setAthleteIndex((current) => (current - 1 + athletes.length) % athletes.length);
      setProgress(0);
    },
    direction,
    progress,
    sportOrder,
  }), [athleteIndex, athlete, activeSport, availableSports, direction, progress]);

  return <LandingExperienceContext.Provider value={value}>{children}</LandingExperienceContext.Provider>;
}

export function useLandingExperience() {
  const context = useContext(LandingExperienceContext);

  if (!context) {
    throw new Error("useLandingExperience must be used inside LandingExperienceProvider");
  }

  return context;
}

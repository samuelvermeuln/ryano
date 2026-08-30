/**
 * Testes do rate limiter por módulo do Strava (Task 6.3).
 *
 * Cobre o parser puro de headers, a semântica das duas janelas (15 min + diária)
 * para os buckets overall/read, reserva/bloqueio, rollover de janela, sincronização
 * autoritativa por headers e o backoff. Tudo OFFLINE e determinístico via relógio
 * injetável — sem I/O, sem rede, sem segredos.
 *
 * Limites oficiais confirmados na doc (parafraseado, conformidade de licenciamento
 * — https://developers.strava.com/docs/rate-limits/): overall 200/15min & 2000/dia;
 * read/non-upload 100/15min & 1000/dia; janela curta reinicia em 0/15/30/45 min;
 * diária à meia-noite UTC; violar o limite curto ainda consome o longo.
 *
 * _Requisitos: 11.7, 18.4_
 */

import { describe, expect, it } from "vitest";

import {
  nextShortTermReset,
  nextUtcMidnight,
  parseStravaRateLimitHeaders,
  parseStravaRateLimitPair,
  StravaRateLimiter,
  STRAVA_SHORT_TERM_WINDOW_MS,
} from "@/modules/strava/infrastructure/rate-limit";
import type { StravaRateLimitLimits } from "@/modules/strava/infrastructure/rate-limit";

const SMALL_LIMITS: StravaRateLimitLimits = {
  overall: { shortTermLimit: 4, dailyLimit: 6 },
  read: { shortTermLimit: 2, dailyLimit: 3 },
};

// 2024-01-01T00:07:00Z — dentro da janela curta que reinicia às 00:15Z.
const BASE = Date.UTC(2024, 0, 1, 0, 7, 0, 0);

function makeClock(start: number) {
  const ref = { now: start };
  return {
    now: () => ref.now,
    advance: (ms: number) => {
      ref.now += ms;
    },
    set: (ms: number) => {
      ref.now = ms;
    },
  };
}

describe("parseStravaRateLimitPair", () => {
  it("parses a valid comma-separated pair", () => {
    expect(parseStravaRateLimitPair("314,27536")).toEqual({
      shortTerm: 314,
      daily: 27536,
    });
  });

  it("returns undefined for missing/malformed values", () => {
    expect(parseStravaRateLimitPair(undefined)).toBeUndefined();
    expect(parseStravaRateLimitPair("")).toBeUndefined();
    expect(parseStravaRateLimitPair("100")).toBeUndefined();
    expect(parseStravaRateLimitPair("a,b")).toBeUndefined();
    expect(parseStravaRateLimitPair("1,2,3")).toBeUndefined();
    expect(parseStravaRateLimitPair("-1,2")).toBeUndefined();
  });
});

describe("parseStravaRateLimitHeaders", () => {
  it("parses overall and read headers from a plain object (case-insensitive)", () => {
    const report = parseStravaRateLimitHeaders({
      "x-ratelimit-limit": "200,2000",
      "X-RateLimit-Usage": "10,100",
      "x-readratelimit-limit": "100,1000",
      "X-ReadRateLimit-Usage": "5,50",
    });

    expect(report.overall).toEqual({
      limit: { shortTerm: 200, daily: 2000 },
      usage: { shortTerm: 10, daily: 100 },
    });
    expect(report.read).toEqual({
      limit: { shortTerm: 100, daily: 1000 },
      usage: { shortTerm: 5, daily: 50 },
    });
  });

  it("parses from a fetch Headers instance", () => {
    const headers = new Headers();
    headers.set("X-RateLimit-Limit", "200,2000");
    headers.set("X-RateLimit-Usage", "692,29300");

    const report = parseStravaRateLimitHeaders(headers);
    expect(report.overall?.usage).toEqual({ shortTerm: 692, daily: 29300 });
    expect(report.read).toBeUndefined();
  });

  it("omits buckets when no valid header is present", () => {
    expect(parseStravaRateLimitHeaders({})).toEqual({});
  });
});

describe("window boundary helpers", () => {
  it("nextShortTermReset aligns to the next natural quarter-hour", () => {
    expect(nextShortTermReset(BASE)).toBe(Date.UTC(2024, 0, 1, 0, 15, 0, 0));
    // Exactly on a boundary → advances to the following boundary.
    const onBoundary = Date.UTC(2024, 0, 1, 0, 15, 0, 0);
    expect(nextShortTermReset(onBoundary)).toBe(Date.UTC(2024, 0, 1, 0, 30, 0, 0));
  });

  it("nextUtcMidnight returns the next UTC midnight", () => {
    expect(nextUtcMidnight(BASE)).toBe(Date.UTC(2024, 0, 2, 0, 0, 0, 0));
  });
});

describe("StravaRateLimiter.reserve", () => {
  it("grants read requests until the read short-term limit, then blocks", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    // read short-term limit = 2
    expect(limiter.reserve("read")).toEqual({ granted: true });
    expect(limiter.reserve("read")).toEqual({ granted: true });

    const blocked = limiter.reserve("read");
    expect(blocked.granted).toBe(false);
    if (!blocked.granted) {
      expect(blocked.bucket).toBe("read");
      expect(blocked.window).toBe("shortTerm");
      // Blocks until 00:15Z.
      expect(blocked.retryAfterMs).toBe(
        Date.UTC(2024, 0, 1, 0, 15, 0, 0) - BASE,
      );
    }
  });

  it("read requests consume both overall and read buckets", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("read");
    const snap = limiter.snapshot();
    expect(snap.read.shortTerm.count).toBe(1);
    expect(snap.overall.shortTerm.count).toBe(1);
  });

  it("write requests consume only the overall bucket", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("write");
    const snap = limiter.snapshot();
    expect(snap.overall.shortTerm.count).toBe(1);
    expect(snap.read.shortTerm.count).toBe(0);
  });

  it("does not increment counters when a request is blocked", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("read");
    limiter.reserve("read");
    const before = limiter.snapshot().read.shortTerm.count;
    limiter.reserve("read"); // blocked
    const after = limiter.snapshot().read.shortTerm.count;
    expect(after).toBe(before);
  });

  it("resets the short-term window at the boundary while daily usage persists", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("read");
    limiter.reserve("read"); // read short-term now full (2/2), daily 2/3

    // Advance past the 15-min boundary.
    clock.set(Date.UTC(2024, 0, 1, 0, 15, 0, 1));

    const decision = limiter.reserve("read");
    expect(decision).toEqual({ granted: true });

    const snap = limiter.snapshot();
    // Short-term reset to reflect just this new request...
    expect(snap.read.shortTerm.count).toBe(1);
    // ...but the daily counter kept accumulating (short-term violations still
    // count toward the daily limit).
    expect(snap.read.daily.count).toBe(3);
  });

  it("blocks on the daily limit and reports midnight as the reset", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    // read daily limit = 3. Spread across short-term windows to avoid the
    // short-term cap masking the daily cap.
    limiter.reserve("read"); // daily 1
    clock.set(Date.UTC(2024, 0, 1, 0, 15, 0, 1));
    limiter.reserve("read"); // daily 2
    clock.set(Date.UTC(2024, 0, 1, 0, 30, 0, 1));
    limiter.reserve("read"); // daily 3 (full)
    clock.set(Date.UTC(2024, 0, 1, 0, 45, 0, 1));

    const blocked = limiter.reserve("read");
    expect(blocked.granted).toBe(false);
    if (!blocked.granted) {
      expect(blocked.bucket).toBe("read");
      expect(blocked.window).toBe("daily");
      expect(blocked.retryAfterMs).toBe(
        Date.UTC(2024, 0, 2, 0, 0, 0, 0) - Date.UTC(2024, 0, 1, 0, 45, 0, 1),
      );
    }
  });
});

describe("StravaRateLimiter.updateFromHeaders", () => {
  it("syncs counters to the authoritative usage (taking the max) and updates limits", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("read"); // local read=1, overall=1

    limiter.updateFromHeaders({
      overall: {
        limit: { shortTerm: 200, daily: 2000 },
        usage: { shortTerm: 50, daily: 300 },
      },
      read: {
        limit: { shortTerm: 100, daily: 1000 },
        usage: { shortTerm: 40, daily: 250 },
      },
    });

    const snap = limiter.snapshot();
    expect(snap.overall.shortTerm).toMatchObject({ count: 50, limit: 200 });
    expect(snap.overall.daily).toMatchObject({ count: 300, limit: 2000 });
    expect(snap.read.shortTerm).toMatchObject({ count: 40, limit: 100 });
    expect(snap.read.daily).toMatchObject({ count: 250, limit: 1000 });
    expect(snap.read.shortTerm.remaining).toBe(60);
  });

  it("never lowers the local counter below its reserved value (conservative max)", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });

    limiter.reserve("read");
    limiter.reserve("read"); // local read short-term = 2

    // Strava reports a lower usage (e.g., a request not yet counted remotely).
    limiter.updateFromHeaders({ read: { usage: { shortTerm: 1, daily: 1 } } });

    expect(limiter.snapshot().read.shortTerm.count).toBe(2);
  });
});

describe("StravaRateLimiter.getBackoff", () => {
  it("reports not blocked when under the limit", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });
    limiter.reserve("read");
    expect(limiter.getBackoff("read")).toEqual({ blocked: false });
  });

  it("reports blocked with the reset delay when a window is exhausted", () => {
    const clock = makeClock(BASE);
    const limiter = new StravaRateLimiter({ limits: SMALL_LIMITS, now: clock.now });
    limiter.reserve("read");
    limiter.reserve("read"); // read short-term full

    const backoff = limiter.getBackoff("read");
    expect(backoff.blocked).toBe(true);
    if (backoff.blocked) {
      expect(backoff.window).toBe("shortTerm");
      expect(backoff.retryAfterMs).toBe(
        Date.UTC(2024, 0, 1, 0, 15, 0, 0) - BASE,
      );
    }

    // A write is still allowed (overall bucket has room).
    expect(limiter.getBackoff("write")).toEqual({ blocked: false });
  });
});

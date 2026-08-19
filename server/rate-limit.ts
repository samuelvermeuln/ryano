type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getBucketKey(scope: string, key: string) {
  return `${scope}:${key}`;
}

export function assertRateLimit(key: string, limit: number, windowMs: number, scope = "default") {
  const now = Date.now();
  const bucketKey = getBucketKey(scope, key);
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  bucket.count += 1;
}

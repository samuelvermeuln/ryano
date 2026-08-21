const baseUrl = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
const url = `${baseUrl.replace(/\/$/, "")}/api/health`;

try {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = await response.json();

  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok || !payload.ready) {
    process.exit(1);
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        service: "ryvano-health-check",
        url,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

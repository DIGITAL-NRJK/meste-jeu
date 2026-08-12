import { performance } from "node:perf_hooks";

const defaults = {
  baseUrl: process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000",
  paths: (process.env.LOAD_TEST_PATHS ?? "/api/health").split(","),
  requests: Number(process.env.LOAD_TEST_REQUESTS ?? 300),
  concurrency: Number(process.env.LOAD_TEST_CONCURRENCY ?? 25),
  timeoutMs: Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 5_000),
  maxP95Ms: Number(process.env.LOAD_TEST_MAX_P95_MS ?? 1_500),
  maxErrorRate: Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? 0.01),
};

function usage() {
  console.log(`Usage: npm run test:load -- [options]

Options:
  --base-url <url>        Target origin (default: ${defaults.baseUrl})
  --path <path>           GET path, repeatable (default: /api/health)
  --requests <number>     Total requests (default: ${defaults.requests})
  --concurrency <number>  Parallel workers (default: ${defaults.concurrency})
  --timeout-ms <number>   Per-request timeout (default: ${defaults.timeoutMs})
  --max-p95-ms <number>   Failure threshold (default: ${defaults.maxP95Ms})
  --max-error-rate <0..1> Failure threshold (default: ${defaults.maxErrorRate})
  --help                  Show this help

Only idempotent GET requests are sent. Never include credentials in --base-url.`);
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = { ...defaults, paths: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return null;
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${argument}`);

    switch (argument) {
      case "--base-url":
        options.baseUrl = value;
        break;
      case "--path":
        options.paths.push(value);
        break;
      case "--requests":
        options.requests = positiveInteger(value, argument);
        break;
      case "--concurrency":
        options.concurrency = positiveInteger(value, argument);
        break;
      case "--timeout-ms":
        options.timeoutMs = positiveInteger(value, argument);
        break;
      case "--max-p95-ms":
        options.maxP95Ms = positiveInteger(value, argument);
        break;
      case "--max-error-rate":
        options.maxErrorRate = Number(value);
        if (options.maxErrorRate < 0 || options.maxErrorRate > 1) {
          throw new Error(`${argument} must be between 0 and 1`);
        }
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
    index += 1;
  }

  if (options.paths.length === 0) options.paths = defaults.paths;
  options.paths = options.paths.map((path) => {
    const normalized = path.trim();
    if (!normalized.startsWith("/") || normalized.startsWith("//")) {
      throw new Error(`Invalid path: ${path}`);
    }
    return normalized;
  });

  const baseUrl = new URL(options.baseUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("--base-url must use http or https");
  }
  if (baseUrl.username || baseUrl.password) {
    throw new Error("Credentials are not allowed in --base-url");
  }
  options.baseUrl = baseUrl.origin;
  options.concurrency = Math.min(options.concurrency, options.requests);
  return options;
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.ceil(sortedValues.length * ratio) - 1] ?? 0;
}

async function execute(options) {
  const durations = [];
  const statusCounts = new Map();
  let cursor = 0;
  let failures = 0;
  const startedAt = performance.now();

  async function worker() {
    while (cursor < options.requests) {
      const requestIndex = cursor;
      cursor += 1;
      const path = options.paths[requestIndex % options.paths.length];
      const requestStartedAt = performance.now();

      try {
        const response = await fetch(new URL(path, options.baseUrl), {
          method: "GET",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        const status = String(response.status);
        statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
        if (!response.ok) failures += 1;
        await response.arrayBuffer();
      } catch {
        failures += 1;
        statusCounts.set(
          "network_error",
          (statusCounts.get("network_error") ?? 0) + 1,
        );
      } finally {
        durations.push(performance.now() - requestStartedAt);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));

  durations.sort((left, right) => left - right);
  const elapsedMs = performance.now() - startedAt;
  const errorRate = failures / options.requests;
  const summary = {
    requests: options.requests,
    concurrency: options.concurrency,
    paths: options.paths,
    elapsedMs: Math.round(elapsedMs),
    requestsPerSecond: Number(
      (options.requests / (elapsedMs / 1_000)).toFixed(1),
    ),
    latencyMs: {
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      max: Math.round(durations.at(-1) ?? 0),
    },
    failures,
    errorRate: Number(errorRate.toFixed(4)),
    statuses: Object.fromEntries(statusCounts),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.latencyMs.p95 > options.maxP95Ms || errorRate > options.maxErrorRate) {
    process.exitCode = 1;
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    usage();
  } else {
    await execute(options);
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid load test configuration",
  );
  usage();
  process.exitCode = 1;
}

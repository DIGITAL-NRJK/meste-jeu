import type { Config, Context } from "@netlify/edge-functions";

export default function rateLimitRegistration(
  _request: Request,
  context: Context,
): Promise<Response> {
  return context.next();
}

export const config: Config = {
  path: "/api/register",
  method: "POST",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["domain", "ip"],
    windowLimit: 1_500,
    windowSize: 60,
  },
};

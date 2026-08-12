import type { Config, Context } from "@netlify/edge-functions";

export default function rateLimitAdminLogin(
  _request: Request,
  context: Context,
): Promise<Response> {
  return context.next();
}

export const config: Config = {
  path: "/api/admin/login",
  method: "POST",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["domain", "ip"],
    windowLimit: 8,
    windowSize: 180,
  },
};

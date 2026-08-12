import type { NextConfig } from "next";

import { buildSecurityHeaders, type SecurityEnvironment } from "@citychatbot/security/headers";

const configuredEnvironment = process.env.CITYCHATBOT_ENV;
const securityEnvironment: SecurityEnvironment =
  configuredEnvironment === "test" || configuredEnvironment === "staging" || configuredEnvironment === "production"
    ? configuredEnvironment
    : "local";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@citychatbot/config", "@citychatbot/security"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(securityEnvironment),
      },
    ];
  },
};

export default nextConfig;

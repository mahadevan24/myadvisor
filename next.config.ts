import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin is externalized by default. Bundling it prevents its CommonJS
  // auth entrypoint from requiring jose's ESM build at runtime on Vercel.
  transpilePackages: ["firebase-admin"],
};

export default nextConfig;

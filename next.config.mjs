/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SQL-first data layer is server-only; never bundle DB drivers to client.
  experimental: {
    serverComponentsExternalPackages: ["postgres", "kysely", "kysely-postgres-js"],
  },
};

export default nextConfig;

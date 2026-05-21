/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing TS sources from sibling workspace.
  transpilePackages: ['@match-move/server'],
};
export default nextConfig;

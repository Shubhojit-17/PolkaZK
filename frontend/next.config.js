/** @type {import('next').NextConfig} */
const isProdBuild = process.env.NODE_ENV === "production";

const nextConfig = {
  trailingSlash: true,
  ...(isProdBuild ? { output: "export" } : {}),
};

module.exports = nextConfig;

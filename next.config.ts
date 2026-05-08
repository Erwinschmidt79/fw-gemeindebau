import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ["leaflet", "leaflet.markercluster"],
};

export default config;

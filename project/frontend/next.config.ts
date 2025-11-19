import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

const path = require('path')
 
module.exports = {
  // this includes files from the monorepo base two directories up
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig;

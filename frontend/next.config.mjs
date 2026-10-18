/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config) => {
    /**
     * The wagmi connector barrel transitively imports the Base Account
     * connector, which references optional `@x402/*` and related packages that
     * this project does not use (we only register the injected/MetaMask
     * connector). Alias them to empty modules so the bundle resolves cleanly.
     */
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;

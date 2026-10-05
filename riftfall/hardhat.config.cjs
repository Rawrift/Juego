require('@nomicfoundation/hardhat-toolbox');

try {
  process.loadEnvFile('.env');
} catch {
  // sin archivo .env: se usan las variables del entorno
}

const { DEPLOYER_PRIVATE_KEY, BASE_RPC_URL, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY } = process.env;
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' }
  },
  paths: { sources: './contracts', tests: './test/contracts', cache: './cache', artifacts: './artifacts' },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 },
    baseSepolia: { url: BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', chainId: 84532, accounts },
    base: { url: BASE_RPC_URL || 'https://mainnet.base.org', chainId: 8453, accounts }
  },
  etherscan: { apiKey: BASESCAN_API_KEY || '' },
  mocha: { timeout: 120000 }
};

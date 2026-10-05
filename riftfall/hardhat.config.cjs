require('@nomicfoundation/hardhat-toolbox');

try {
  process.loadEnvFile('.env');
} catch {
  // sin archivo .env: se usan las variables del entorno
}

const { DEPLOYER_PRIVATE_KEY, BSC_RPC_URL, BSC_TESTNET_RPC_URL, BASE_RPC_URL, BASE_SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, BASESCAN_API_KEY } =
  process.env;
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    // viaIR: el constructor de RiftShips con catálogo inicial excede la pila del generador clásico.
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', viaIR: true }
  },
  paths: { sources: './contracts', tests: './test/contracts', cache: './cache', artifacts: './artifacts' },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 },
    // BNB Smart Chain: red recomendada (comisiones de céntimos).
    bscTestnet: { url: BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com', chainId: 97, accounts },
    bsc: { url: BSC_RPC_URL || 'https://bsc-dataseed.bnbchain.org', chainId: 56, accounts },
    baseSepolia: { url: BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', chainId: 84532, accounts },
    base: { url: BASE_RPC_URL || 'https://mainnet.base.org', chainId: 8453, accounts }
  },
  // Etherscan API v2: una sola clave sirve para BscScan y Basescan.
  etherscan: { apiKey: ETHERSCAN_API_KEY || BASESCAN_API_KEY || '' },
  mocha: { timeout: 120000 }
};

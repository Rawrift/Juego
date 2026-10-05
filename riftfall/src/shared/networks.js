// Datos públicos por red, compartidos por el cliente y el servidor.
export const NETWORK_INFO = {
  56: { name: 'bsc', nativeSymbol: 'BNB', explorer: 'https://bscscan.com', rpc: 'https://bsc-dataseed.bnbchain.org' },
  97: { name: 'bscTestnet', nativeSymbol: 'tBNB', explorer: 'https://testnet.bscscan.com', rpc: 'https://bsc-testnet-rpc.publicnode.com' },
  8453: { name: 'base', nativeSymbol: 'ETH', explorer: 'https://basescan.org', rpc: 'https://mainnet.base.org' },
  84532: { name: 'baseSepolia', nativeSymbol: 'ETH', explorer: 'https://sepolia.basescan.org', rpc: 'https://sepolia.base.org' },
  31337: { name: 'localhost', nativeSymbol: 'ETH', explorer: '', rpc: 'http://127.0.0.1:8545' }
};

/** Configuración de cadena para el cliente a partir de un archivo de despliegue (Lanzador o script). */
export function chainConfigFromDeployment(dep, overrides = {}) {
  const info = NETWORK_INFO[dep.chainId] ?? {};
  return {
    chainId: dep.chainId,
    network: dep.network ?? info.name,
    contracts: dep.contracts,
    rpcUrl: overrides.rpcUrl || info.rpc || '',
    explorerUrl: overrides.explorerUrl || info.explorer || '',
    nativeSymbol: info.nativeSymbol ?? 'ETH',
    tokenSymbol: dep.token?.symbol ?? 'RIFT'
  };
}

// Integración con la wallet del jugador (EIP-1193: MetaMask, Rabby, Coinbase Wallet...).
// Las aprobaciones de RIFT son siempre por el importe exacto, nunca ilimitadas.

import { BrowserProvider, JsonRpcProvider, Contract, formatEther } from 'ethers';
import { TOKEN_ABI, VAULT_ABI, SHIPS_ABI, MARKET_ABI, ARENA_ABI } from '../shared/abis.js';
import { t } from './i18n.js';

const ETH = { name: 'Ether', symbol: 'ETH', decimals: 18 };
const CHAINS = {
  31337: { chainId: '0x7a69', chainName: 'RIFTFALL Local (Hardhat)', rpcUrls: ['http://127.0.0.1:8545'], nativeCurrency: ETH },
  56: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
    blockExplorerUrls: ['https://bscscan.com'],
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
  },
  97: {
    chainId: '0x61',
    chainName: 'BNB Smart Chain Testnet',
    rpcUrls: ['https://bsc-testnet-rpc.publicnode.com'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 }
  },
  84532: {
    chainId: '0x14a34',
    chainName: 'Base Sepolia',
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    nativeCurrency: ETH
  },
  8453: {
    chainId: '0x2105',
    chainName: 'Base',
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
    nativeCurrency: ETH
  }
};

export function explainError(err) {
  if (!err) return t('err.unknown');
  if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err?.info?.error?.code === 4001) return t('err.rejected');
  if (err.code === 'INSUFFICIENT_FUNDS') return t('err.funds');
  const reason = err.reason || err.revert?.args?.[0] || err.shortMessage || err.message;
  return String(reason).replace(/^execution reverted:?\s*/i, '').slice(0, 180);
}

export function createWallet(chainCfg) {
  const c = chainCfg.contracts;
  let browser = null;
  let signer = null;
  let address = null;
  const listeners = new Set();
  const readProvider = chainCfg.rpcUrl
    ? new JsonRpcProvider(chainCfg.rpcUrl, chainCfg.chainId, { staticNetwork: true, cacheTimeout: -1 })
    : null;

  const reader = () => readProvider ?? browser;
  const contracts = (runner) => ({
    token: new Contract(c.RiftToken, TOKEN_ABI, runner),
    vault: new Contract(c.RewardVault, VAULT_ABI, runner),
    ships: new Contract(c.RiftShips, SHIPS_ABI, runner),
    market: new Contract(c.RiftMarket, MARKET_ABI, runner),
    arena: new Contract(c.RiftArena, ARENA_ABI, runner)
  });
  const R = () => contracts(reader());
  const W = () => {
    if (!signer) throw new Error(t('err.connectFirst'));
    return contracts(signer);
  };

  async function ensureChain() {
    const net = await browser.getNetwork();
    if (Number(net.chainId) === chainCfg.chainId) return;
    const params = CHAINS[chainCfg.chainId] ?? { chainId: `0x${chainCfg.chainId.toString(16)}` };
    try {
      await browser.send('wallet_switchEthereumChain', [{ chainId: params.chainId }]);
    } catch (err) {
      const code = err?.error?.code ?? err?.code ?? err?.info?.error?.code;
      if ((code === 4902 || code === -32603) && CHAINS[chainCfg.chainId]) await browser.send('wallet_addEthereumChain', [params]);
      else throw err;
    }
    browser = new BrowserProvider(window.ethereum, 'any');
  }

  async function approveIfNeeded(spender, amount) {
    const { token } = W();
    const current = await token.allowance(address, spender);
    if (current >= amount) return;
    await (await token.approve(spender, amount)).wait();
  }

  return {
    get address() {
      return address;
    },
    get connected() {
      return !!signer;
    },
    available: () => typeof window !== 'undefined' && !!window.ethereum,
    onChange(fn) {
      listeners.add(fn);
    },

    async connect() {
      if (!window.ethereum) throw new Error(t('err.noWallet'));
      browser = new BrowserProvider(window.ethereum, 'any');
      await browser.send('eth_requestAccounts', []);
      await ensureChain();
      signer = await browser.getSigner();
      address = await signer.getAddress();
      window.ethereum.on?.('accountsChanged', () => listeners.forEach((fn) => fn('accounts')));
      window.ethereum.on?.('chainChanged', () => listeners.forEach((fn) => fn('chain')));
      return address;
    },

    signMessage: (msg) => signer.signMessage(msg),

    /** Pide a la wallet que muestre el token del juego en su lista de activos. */
    async watchToken() {
      if (!window.ethereum) return false;
      return window.ethereum.request({
        method: 'wallet_watchAsset',
        params: { type: 'ERC20', options: { address: c.RiftToken, symbol: chainCfg.tokenSymbol ?? 'RIFT', decimals: 18 } }
      });
    },

    async balances() {
      if (!address) return null;
      const { token } = R();
      const [eth, rift] = await Promise.all([reader().getBalance(address), token.balanceOf(address)]);
      return { eth, rift, ethText: formatEther(eth), riftText: formatEther(rift) };
    },

    async catalog() {
      const { ships } = R();
      const n = Number(await ships.classCount());
      const out = [];
      for (let i = 0; i < n; i++) out.push({ classId: i, ...(await ships.getClass(i)).toObject() });
      return out;
    },

    async myShips() {
      if (!address) return [];
      const [ids, classIds, levels] = await R().ships.shipsOf(address);
      return ids.map((id, i) => ({ tokenId: id.toString(), classId: Number(classIds[i]), level: Number(levels[i]) }));
    },

    forgeCost: (level) => R().ships.forgeCost(level),

    async mint(classId, payWith, price) {
      const { ships } = W();
      if (payWith === 'rift') {
        await approveIfNeeded(c.RiftShips, price);
        return (await ships.mintWithRift(classId)).wait();
      }
      return (await ships.mint(classId, { value: price })).wait();
    },

    async forge(tokenId, cost) {
      await approveIfNeeded(c.RiftShips, cost);
      return (await W().ships.forge(tokenId)).wait();
    },

    async listings() {
      const { market, ships } = R();
      const total = Number(await market.listedCount());
      const [ids, sellers, prices] = await market.listedPage(0, Math.min(total, 60));
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const [owner, classId, level] = await Promise.all([ships.ownerOf(ids[i]), ships.classOf(ids[i]), ships.levelOf(ids[i])]);
        if (owner.toLowerCase() !== sellers[i].toLowerCase()) continue; // anuncio obsoleto
        out.push({ tokenId: ids[i].toString(), seller: sellers[i], price: prices[i], classId: Number(classId), level: Number(level) });
      }
      return out;
    },

    async marketFee() {
      return Number(await R().market.feeBps());
    },

    async list(tokenId, price) {
      const { ships, market } = W();
      if (!(await ships.isApprovedForAll(address, c.RiftMarket))) {
        await (await ships.setApprovalForAll(c.RiftMarket, true)).wait();
      }
      return (await market.list(tokenId, price)).wait();
    },

    cancelListing: async (tokenId) => (await W().market.cancel(tokenId)).wait(),

    async buy(tokenId, price) {
      await approveIfNeeded(c.RiftMarket, price);
      return (await W().market.buy(tokenId, price)).wait();
    },

    async claim(cl) {
      return (await W().vault.claim(BigInt(cl.amountWei), BigInt(cl.id), cl.deadline, cl.signature)).wait();
    },

    async enterArena(id, fee) {
      await approveIfNeeded(c.RiftArena, fee);
      return (await W().arena.enter(BigInt(id))).wait();
    },

    async tournament(id) {
      const [t, payout] = await R().arena.getTournament(BigInt(id));
      return { ...t.toObject(), payout: payout.map(Number) };
    }
  };
}

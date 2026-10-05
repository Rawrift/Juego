// Conexión con la blockchain: lecturas de contratos, firma de vales EIP-712 y operación de la Arena.

import fs from 'node:fs';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import {
  TOKEN_ABI,
  VAULT_ABI,
  SHIPS_ABI,
  ARENA_ABI,
  CLAIM_TYPES,
  VAULT_DOMAIN_NAME
} from '../src/shared/abis.js';

// Clave pública de prueba de Hardhat (cuenta #1). Solo se usa automáticamente en la red local 31337.
const HARDHAT_SIGNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

export async function initChain({ rpcUrl, deploymentFile, signerKey }) {
  if (!rpcUrl || !deploymentFile || !fs.existsSync(deploymentFile)) return null;
  const dep = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  const provider = new JsonRpcProvider(rpcUrl, dep.chainId, { staticNetwork: true, cacheTimeout: -1 });
  let key = signerKey;
  if (!key && dep.chainId === 31337) key = HARDHAT_SIGNER_KEY;
  if (!key) throw new Error('Falta SIGNER_PRIVATE_KEY para firmar vales de recompensa');
  const signer = new Wallet(key, provider);
  if (dep.roles?.signer && signer.address.toLowerCase() !== dep.roles.signer.toLowerCase()) {
    console.warn(`AVISO: la clave del servidor (${signer.address}) no es el signer del RewardVault (${dep.roles.signer}).`);
  }

  const c = dep.contracts;
  const token = new Contract(c.RiftToken, TOKEN_ABI, provider);
  const vault = new Contract(c.RewardVault, VAULT_ABI, provider);
  const ships = new Contract(c.RiftShips, SHIPS_ABI, provider);
  const arena = new Contract(c.RiftArena, ARENA_ABI, signer);
  const domain = { name: VAULT_DOMAIN_NAME, version: '1', chainId: dep.chainId, verifyingContract: c.RewardVault };

  await provider.getBlockNumber(); // falla rápido si el RPC no responde

  return {
    deployment: dep,
    provider,
    signer,
    token,
    vault,
    ships,
    arena,

    signClaim(player, amount, claimId, deadline) {
      return signer.signTypedData(domain, CLAIM_TYPES, { player, amount, claimId, deadline });
    },

    async ship(tokenId) {
      const [owner, classId, level] = await Promise.all([
        ships.ownerOf(tokenId),
        ships.classOf(tokenId),
        ships.levelOf(tokenId)
      ]);
      return { owner, classId: Number(classId), level: Number(level) };
    },

    async shipsOf(owner) {
      const [ids, classIds, levels] = await ships.shipsOf(owner);
      return ids.map((id, i) => ({ tokenId: id.toString(), classId: Number(classIds[i]), level: Number(levels[i]) }));
    },

    async vaultStats() {
      const day = await vault.currentDay();
      const [remaining, budget, maxPerPlayer, balance] = await Promise.all([
        vault.remainingToday(),
        vault.dailyBudget(day),
        vault.maxClaimPerPlayerPerDay(),
        token.balanceOf(c.RewardVault)
      ]);
      return { day: Number(day), remaining, budget, maxPerPlayer, balance };
    },

    async catalog() {
      const n = Number(await ships.classCount());
      const out = [];
      for (let i = 0; i < n; i++) {
        const k = await ships.getClass(i);
        out.push({
          classId: i,
          name: k.name,
          color: k.color,
          priceWei: k.priceWei.toString(),
          priceRift: k.priceRift.toString(),
          maxSupply: Number(k.maxSupply),
          minted: Number(k.minted),
          active: k.active
        });
      }
      return out;
    }
  };
}

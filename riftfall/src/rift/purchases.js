// Las compras se cotizan y reconocen en la cuenta antes de dar beneficios locales.
import { account, api, start, sessionToken, loginWallet, claimPurchase, reloadForAccount } from './account.js';

const fail = (code) => Object.assign(new Error(code), { code });

export async function preparePurchase(kind, item, method, payer, provider) {
  if (!sessionToken() && !(await start())) throw fail('offline');
  if (!account()?.wallets?.includes(payer.toLowerCase())) {
    const login = await loginWallet(provider);
    if (login.switched) {
      reloadForAccount();
      throw fail('accountChanged');
    }
  }
  return (await api('POST', '/api/rift/purchase/order', { kind, item, method, payer })).order;
}

export async function confirmedPurchase(hash, kind, expectPayer = null, { wait = false } = {}) {
  hash = String(hash ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw fail('badHash');
  if (!sessionToken() && !(await start())) throw fail('offline');
  const until = Date.now() + (wait ? 90_000 : 0);
  while (true) {
    try {
      const a = await claimPurchase(hash);
      const p = a?.purchases?.find((x) => x.tx.toLowerCase() === hash);
      if (!p) throw fail('offline');
      if (p.kind !== kind) throw fail('otherItem');
      if (expectPayer && p.payer !== expectPayer.toLowerCase()) throw fail('otherPayer');
      return p;
    } catch (err) {
      if (err.code !== 'pending' || Date.now() >= until) throw err;
      await new Promise((done) => setTimeout(done, 2000));
    }
  }
}

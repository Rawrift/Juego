// Paneles laterales: Hangar, Mercado, Arena, Ranking, Canje, Economía y Piloto (talentos).

import { formatEther, parseEther } from 'ethers';
import {
  SHIPS,
  SHIP_BY_CLASS,
  shipYield,
  TALENT_ORDER,
  TALENT_MAX,
  TALENTS,
  talentCost,
  PART_SLOTS,
  PART_DESIGNS,
  PART_MAX,
  CRATE_COST
} from '../sim/index.js';
import { drawShipPreview, iconCopy } from './sprites.js';
import { FOUNDER, tierRank, bnbWeiForUsd } from '../shared/founder.js';
import { loadFounder, founderRank, buyFounder, verifyPayment, bnbPrice, currentSkin, setSkin, SKIN_TIER } from './founder.js';
import { explainError } from './wallet.js';
import { injected } from './injected.js';
import { metamaskLink, continueLink } from './transfer.js';
import { fiatLabel, openFiatPay } from '../rift/fiat-ui.js';
import { claimPurchase } from '../rift/account.js';
import { WORLD, myPublicId, fetchRunBoard, fetchWorldDaily } from './world.js';
import { dailyNumber } from '../shared/daily.js';
import { $, el, toast, fmtTime, fmtNum, shortAddr, fmtRift, brandText } from './dom.js';
import { t, tx, locale, lang } from './i18n.js';
import { openInMetaMask } from '../rift/open-in-metamask.js';
import { remoteWallet } from '../rift/wallet.js';

/** Ícono de cada talento (reutiliza los de las mejoras parecidas). */
const TALENT_ICON = { hull: 'hull', power: 'might', reflex: 'haste', engines: 'thrust', magnet: 'magnet', memory: 'growth' };
const num = (v, opts) => Number(v).toLocaleString(locale, opts);
const trimAmount = (v) => Number(v).toLocaleString(locale, { maximumFractionDigits: 4 });

export function createPanels(app) {
  const sheet = $('#sheet');
  const body = $('#sheetBody');
  let current = null;
  let anim = null;

  $('#sheetClose').addEventListener('click', close);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });

  function close() {
    sheet.classList.add('hidden');
    current = null;
    cancelAnimationFrame(anim);
  }

  const tokenSymbol = () => app.config?.chain?.tokenSymbol ?? 'RIFT';
  const nativeSymbol = () => app.config?.chain?.nativeSymbol ?? 'ETH';

  function frame(kicker, title) {
    $('#sheetKicker').textContent = kicker;
    $('#sheetTitle').textContent = title;
    brandText($('#sheet header'), tokenSymbol());
    body.replaceChildren(el('p', { class: 'hint' }, t('sheet.loading')));
    sheet.classList.remove('hidden');
  }

  async function open(name) {
    current = name;
    cancelAnimationFrame(anim);
    const view = VIEWS[name];
    if (!view) return;
    frame(t(view.kicker), t(view.title));
    try {
      const nodes = await view.render();
      if (current === name) {
        body.replaceChildren(...nodes.filter(Boolean));
        brandText(body, tokenSymbol());
      }
      animatePreviews();
    } catch (err) {
      body.replaceChildren(el('div', { class: 'notice' }, explainError(err)));
    }
  }

  /** Ejecuta una acción de wallet con estado en el botón y avisos. */
  async function act(btn, label, fn, okMsg) {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      await fn();
      if (okMsg) toast(okMsg, 'ok');
      await app.refreshProfile();
      if (current) open(current);
    } catch (err) {
      toast(explainError(err), 'err');
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

  function needWalletNotice(text) {
    if (!app.config?.chain) {
      return el('div', { class: 'notice' }, t('n.noChain'));
    }
    if (!app.wallet?.connected) {
      return el('div', { class: 'notice info' }, [
        el('p', {}, text),
        el('button', { class: 'btn primary small', style: 'margin-top:10px', onclick: async () => (await app.connectWallet()) && open(current) }, t('menu.connect'))
      ]);
    }
    return null;
  }

  const previews = [];
  function shipCanvas(key) {
    const c = el('canvas', { width: 320, height: 240 });
    previews.push({ c, key });
    return c;
  }
  function animatePreviews() {
    const t0 = performance.now();
    const loop = (t) => {
      for (const p of previews) {
        if (!p.c.isConnected) continue;
        drawShipPreview(p.c, p.key, SHIPS[p.key].color, (t - t0) / 1000 + p.c.width);
      }
      anim = requestAnimationFrame(loop);
    };
    previews.splice(0, previews.length - 40);
    anim = requestAnimationFrame(loop);
  }

  function shipCard({ key, level = 1, tokenId = null, selected, actions = [], extra = null, tag = null }) {
    const s = SHIPS[key];
    return el('div', { class: `ship-card${selected ? ' selected' : ''}`, style: `--accent:${s.color}` }, [
      tokenId ? el('span', { class: 'lv' }, `#${tokenId} · ${t('hud.level', { n: level })}`) : tag ? el('span', { class: 'lv' }, tag) : null,
      shipCanvas(key),
      el('span', { class: 'tier' }, tx.shipTier(key).toUpperCase()),
      el('b', {}, s.name),
      el('span', { class: 'meta' }, tx.shipDesc(key)),
      el('span', { class: 'yield' }, t('ship.yield', { m: shipYield(key, level).toFixed(2) })),
      extra,
      actions.length ? el('div', { class: 'row' }, actions) : null
    ]);
  }

  // ------------------------------------------------------------------ vistas

  // Beneficios acumulados de cada nivel del Pase Fundador.
  const FOUNDER_PERKS = {
    pilot: ['f.perk.badge', 'f.perk.trail'],
    gold: ['f.perk.prev', 'f.perk.skinGold'],
    legend: ['f.perk.prev', 'f.perk.skinPrisma', 'f.perk.leviathan']
  };

  /** Vista previa animada de la nave del jugador con sus piezas. */
  function workshopPreview() {
    const c = el('canvas', { width: 360, height: 360, class: 'ws-preview' });
    const t0 = performance.now();
    const loop = (now) => {
      if (!c.isConnected) return;
      const key = app.ship.key;
      drawShipPreview(c, key, SHIPS[key].color, (now - t0) / 1000, app.skin?.() ?? 'original', app.pilot().loadout);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return c;
  }

  const VIEWS = {
    workshop: {
      kicker: 'pt.kicker',
      title: 'pt.title',
      async render() {
        const pl = app.pilot();
        const inv = pl.parts;
        const load = pl.loadout;
        const out = [el('p', {}, t('pt.intro'))];

        // Beneficios activos
        const bonus = PART_SLOTS.filter((sl) => load[sl]).map((sl) => el('li', {}, `${tx.partName(load[sl])} · ${tx.partPerk(load[sl], inv[load[sl]])}`));
        out.push(
          el('div', { class: 'ws-top' }, [
            workshopPreview(),
            el('div', { class: 'ws-bonus' }, [el('h3', {}, t('pt.bonus')), bonus.length ? el('ul', {}, bonus) : el('p', { class: 'hint' }, t('pt.none'))])
          ])
        );

        // Huecos: cada uno con los 5 diseños
        for (const slot of PART_SLOTS) {
          const row = el('div', { class: 'ws-parts' });
          const original = el('button', { class: `ws-part original${!load[slot] ? ' on' : ''}` }, [el('b', {}, t('pt.empty'))]);
          original.addEventListener('click', async () => {
            await app.equipPart(slot, null);
            open('workshop');
          });
          row.append(original);
          for (const d of PART_DESIGNS) {
            const id = `${slot}:${d}`;
            const lv = inv[id] ?? 0;
            const on = load[slot] === id;
            const b = el('button', { class: `ws-part${on ? ' on' : ''}${lv ? '' : ' locked'}`, style: `--accent:${SHIPS[d].color}`, disabled: !lv }, [
              el('b', {}, lv ? SHIPS[d].name : '?'),
              el('span', {}, lv ? tx.partPerk(id, lv) : t('pt.locked')),
              lv ? el('div', { class: 'pips' }, Array.from({ length: PART_MAX }, (_, k) => el('i', { class: k < lv ? 'on' : '' }))) : null
            ]);
            b.addEventListener('click', async () => {
              try {
                await app.equipPart(slot, on ? null : id);
                app.audio?.play?.('click');
              } catch (err) {
                toast(explainError(err), 'err');
              }
              open('workshop');
            });
            row.append(b);
          }
          out.push(el('h3', {}, t(`pt.slot.${slot}`)), row);
        }

        // Caja de piezas
        const buy = el('button', { class: 'btn gold', disabled: pl.cores < CRATE_COST }, `📦 ${t('pt.crate')}`);
        buy.addEventListener('click', async () => {
          buy.disabled = true;
          try {
            const got = await app.buyCrate();
            app.audio?.play?.('levelup');
            for (const c of got) {
              const msg = c.refund ? t('pt.maxed', { part: tx.partName(c.id) }) : c.lv === 1 ? t('pt.new', { part: tx.partName(c.id) }) : t('pt.up', { part: tx.partName(c.id), n: c.lv });
              toast(`📦 ${msg}`, 'ok');
            }
          } catch (err) {
            toast(err.message === 'poor' ? t('pt.poor') : explainError(err), 'err');
          }
          open('workshop');
        });
        out.push(
          el('div', { class: 'ws-crate' }, [
            el('div', {}, [el('b', {}, t('pt.crateCost', { c: CRATE_COST })), el('span', {}, `${t('tal.cores')}: ${fmtNum(pl.cores)} ✦`)]),
            buy
          ])
        );
        out.push(el('p', { class: 'hint' }, t('pt.note')));
        return out;
      }
    },

    founder: {
      kicker: 'f.kicker',
      title: 'f.title',
      async render() {
        const rec = loadFounder();
        const rank = founderRank();
        let price = null;
        try {
          price = await bnbPrice();
        } catch {
          price = null;
        }
        const out = [el('p', {}, t('f.intro'))];

        if (rec) {
          const skins = Object.keys(SKIN_TIER).filter((k) => rank >= SKIN_TIER[k]);
          const pick = currentSkin();
          out.push(
            el('div', { class: 'founder-status' }, [
              el('b', {}, `★ ${t('f.youAre', { tier: t(`f.tier.${rec.tier}`) })}`),
              rec.owner || !/^0x[0-9a-fA-F]{64}$/.test(rec.tx ?? '')
                ? el('small', {}, rec.owner ? t('f.owner') : '')
                : el('a', { href: `${FOUNDER.explorer}/tx/${rec.tx}`, target: '_blank', rel: 'noopener' }, t('f.viewTx')),
              skins.length > 1
                ? el('div', { class: 'skin-row' }, [
                    el('small', {}, t('f.skin')),
                    ...skins.map((k) => {
                      const b = el('button', { class: `chip-btn${k === pick ? ' on' : ''}` }, t(`f.skin.${k}`));
                      b.addEventListener('click', () => {
                        setSkin(k);
                        app.applyCosmetics();
                        open('founder');
                      });
                      return b;
                    })
                  ])
                : null
            ])
          );
        }

        out.push(
          el(
            'div',
            { class: 'tier-grid' },
            FOUNDER.tiers.map((tier) => {
              const owned = rank >= tierRank(tier.id);
              const card = el('div', { class: `tier-card tier-${tier.id}${owned ? ' owned' : ''}` }, [
                el('span', { class: 'tier-name' }, t(`f.tier.${tier.id}`)),
                el('b', { class: 'tier-price' }, `US$ ${tier.usd}`),
                el('ul', {}, FOUNDER_PERKS[tier.id].map((k) => el('li', {}, t(k))))
              ]);
              if (owned) {
                card.append(el('span', { class: 'tier-owned' }, t('f.owned')));
                return card;
              }
              const usdt = el('button', { class: 'btn gold small' }, t('f.payUsdt', { n: tier.usd }));
              const bnbAmt = price ? Number(bnbWeiForUsd(tier.usd, price) / 10n ** 12n) / 1e6 : null;
              const bnb = el('button', { class: 'btn ghost small', disabled: !bnbAmt }, bnbAmt ? t('f.payBnb', { n: bnbAmt }) : t('f.priceErr'));
              const buy = (btn, method) => async () => {
                // Sin wallet en el navegador y sin WalletConnect: abrir el juego en MetaMask o instalarla.
                if (!injected() && !remoteWallet()) {
                  openInMetaMask(metamaskLink, { lang });
                  return;
                }
                const prev = btn.textContent;
                usdt.disabled = bnb.disabled = true;
                try {
                  const res = await buyFounder(tier.id, method, (stage) => (btn.textContent = t(`f.stage.${stage}`)));
                  // El pase queda también en la Cuenta Rift (en todos tus dispositivos y en Rift Cargo).
                  claimPurchase(res.tx).catch(() => {});
                  app.applyCosmetics();
                  app.audio?.play?.('levelup');
                  toast(t('f.verified', { tier: t(`f.tier.${res.tier}`) }), 'ok');
                  open('founder');
                } catch (err) {
                  toast(explainError(err), 'err');
                  btn.textContent = prev;
                  usdt.disabled = false;
                  bnb.disabled = !bnbAmt;
                }
              };
              usdt.addEventListener('click', buy(usdt, 'usdt'));
              bnb.addEventListener('click', buy(bnb, 'bnb'));
              card.append(el('div', { class: 'row' }, [usdt, bnb]));
              // Pago en pesos (solo si el dueño lo configuró y este nivel se vende así).
              const pesos = fiatLabel('founder', tier.id, lang);
              if (pesos) {
                const ars = el('button', { class: 'btn ghost small' }, pesos);
                ars.addEventListener('click', () => openFiatPay({ kind: 'founder', item: tier.id, name: `${t('f.title')} ${t(`f.tier.${tier.id}`)}` }));
                card.append(el('div', { class: 'row' }, [ars]));
              }
              return card;
            })
          )
        );

        // Restaurar en otro dispositivo con el hash del pago.
        const input = el('input', { class: 'hash-input', placeholder: '0x…', spellcheck: 'false', autocomplete: 'off' });
        const check = el('button', { class: 'btn ghost small' }, t('f.verify'));
        check.addEventListener('click', async () => {
          check.disabled = true;
          try {
            const res = await verifyPayment(input.value);
            claimPurchase(res.tx, { sign: false }).catch(() => {});
            app.applyCosmetics();
            toast(t('f.verified', { tier: t(`f.tier.${res.tier}`) }), 'ok');
            open('founder');
          } catch (err) {
            toast(explainError(err), 'err');
            check.disabled = false;
          }
        });
        out.push(el('h3', {}, t('f.restoreTitle')));
        out.push(el('div', { class: 'restore-row' }, [input, check]));
        out.push(el('p', { class: 'hint' }, t('f.restoreHint')));
        out.push(
          el('div', { class: 'notice info' }, [
            el('p', {}, t('f.howTo', { addr: shortAddr(FOUNDER.treasury) })),
            el('a', { href: `${FOUNDER.explorer}/address/${FOUNDER.treasury}`, target: '_blank', rel: 'noopener' }, t('f.viewWallet'))
          ])
        );
        out.push(el('p', { class: 'hint' }, t('f.legal')));
        return out;
      }
    },
    hangar: {
      kicker: 'h.kicker',
      title: 'h.title',
      async render() {
        const out = [];
        const sel = app.ship;
        const pick = (choice) => () => {
          app.selectShip(choice);
          toast(t('h.ready', { name: SHIPS[choice.key].name }), 'ok');
          open('hangar');
        };
        out.push(el('p', {}, t('h.intro')));
        out.push(el('h3', {}, t('h.yours')));
        // Las naves NFT se leen de la wallet: sin conectarla no aparecen.
        const mineNotice = app.config?.chain && !app.wallet?.connected ? needWalletNotice(t('h.connectMine')) : null;
        if (mineNotice) out.push(mineNotice);
        const mine = [
          shipCard({
            key: 'spark',
            selected: sel.key === 'spark',
            tag: t('h.free'),
            actions: [el('button', { class: 'btn ghost small', onclick: pick({ key: 'spark', tokenId: null, level: 1 }) }, sel.key === 'spark' ? t('h.inUse') : t('h.use'))]
          })
        ];
        if (app.config?.demoShips) {
          for (const key of Object.keys(SHIPS)) {
            if (key === 'spark') continue;
            mine.push(
              shipCard({
                key,
                tag: t('h.demo'),
                selected: sel.key === key,
                actions: [el('button', { class: 'btn ghost small', onclick: pick({ key, tokenId: null, level: 1 }) }, sel.key === key ? t('h.inUse') : t('h.try'))]
              })
            );
          }
        }
        let owned = [];
        if (app.wallet?.connected) {
          owned = await app.wallet.myShips();
          for (const s of owned) {
            const key = SHIP_BY_CLASS[s.classId];
            if (!key) continue;
            const isSel = sel.tokenId === s.tokenId;
            const actions = [
              el('button', { class: 'btn ghost small', onclick: pick({ key, tokenId: s.tokenId, level: s.level }) }, isSel ? t('h.inUse') : t('h.use'))
            ];
            if (s.level < 10) {
              const cost = await app.wallet.forgeCost(s.level);
              const b = el('button', { class: 'btn gold small' }, t('h.forge', { n: s.level + 1, c: fmtRift(cost), sym: 'RIFT' }));
              b.addEventListener('click', () => act(b, t('h.forging'), () => app.wallet.forge(s.tokenId, cost), t('h.forged', { id: s.tokenId, n: s.level + 1 })));
              actions.push(b);
            }
            const sell = el('button', { class: 'btn ghost small' }, t('h.sell'));
            sell.addEventListener('click', () => {
              const v = prompt(t('h.sellPrompt', { sym: tokenSymbol() }), '1000');
              if (!v || !(Number(v) > 0)) return;
              act(sell, t('h.publishing'), () => app.wallet.list(s.tokenId, parseEther(String(v))), t('h.published'));
            });
            actions.push(sell);
            mine.push(shipCard({ key, level: s.level, tokenId: s.tokenId, selected: isSel, actions }));
            if (isSel && s.level !== sel.level) app.selectShip({ key, tokenId: s.tokenId, level: s.level });
          }
        }
        if (sel.tokenId && app.wallet?.connected && !owned.some((s) => s.tokenId === sel.tokenId)) {
          app.selectShip({ key: 'spark', tokenId: null, level: 1 });
        }
        out.push(el('div', { class: 'ship-grid' }, mine));

        out.push(el('h3', {}, t('h.shipyard')));
        if (!app.config?.chain) {
          out.push(el('div', { class: 'notice info' }, t('h.noShop')));
          return out;
        }
        if ([97, 84532, 31337].includes(app.config.chain.chainId)) out.push(el('div', { class: 'notice info' }, t('h.testnet')));
        const notice = mineNotice ? null : needWalletNotice(t('h.connect'));
        if (notice) out.push(notice);
        if (app.config?.chain) {
          const catalog = await (app.wallet ?? null)?.catalog?.().catch(() => null);
          if (catalog) {
            const cards = catalog.map((k) => {
              const key = SHIP_BY_CLASS[k.classId];
              if (!key) return null;
              const left = Number(k.maxSupply) - Number(k.minted);
              const actions = [];
              if (k.priceWei > 0n) {
                const b = el('button', { class: 'btn primary small', disabled: !k.active || left <= 0 }, `${formatEther(k.priceWei)} ${nativeSymbol()}`);
                b.addEventListener('click', async () => {
                  if (!app.wallet.connected && !(await app.connectWallet())) return;
                  // Antes de abrir la wallet: si no alcanza el saldo, explicarlo en vez de mostrar un error de la red.
                  const have = (await app.wallet.balances().catch(() => null))?.eth;
                  if (have !== undefined && have < k.priceWei) {
                    const isTest = [97, 84532, 31337].includes(app.config.chain.chainId);
                    const vars = { have: trimAmount(formatEther(have)), price: trimAmount(formatEther(k.priceWei)), sym: nativeSymbol() };
                    toast(`${t('h.noFunds', vars)}${k.priceRift > 0n ? ` ${t('h.payRift')}` : ''}${isTest ? ` ${t('h.faucet')}` : ''}`, 'err');
                    return;
                  }
                  act(b, t('h.buying'), () => app.wallet.mint(k.classId, 'eth', k.priceWei), t('h.bought', { name: k.name }));
                });
                actions.push(b);
              }
              if (k.priceRift > 0n) {
                const b = el('button', { class: 'btn gold small', disabled: !k.active || left <= 0 }, `${fmtRift(k.priceRift)} RIFT`);
                b.addEventListener('click', async () => {
                  if (!app.wallet.connected && !(await app.connectWallet())) return;
                  act(b, t('h.buying'), () => app.wallet.mint(k.classId, 'rift', k.priceRift), t('h.bought', { name: k.name }));
                });
                actions.push(b);
              }
              return shipCard({
                key,
                extra: el('span', { class: 'meta' }, left > 0 ? t('h.left', { n: fmtNum(left), m: fmtNum(k.maxSupply) }) : t('h.soldOut')),
                actions
              });
            });
            out.push(el('div', { class: 'ship-grid' }, cards));
            out.push(el('p', { class: 'hint' }, t('h.split')));
            if (app.wallet.connected && (await app.wallet.isShipsOwner().catch(() => false))) {
              out.push(...(await ownerPanel(catalog)));
            }
          }
        }
        return out;
      }
    },

    market: {
      kicker: 'm.kicker',
      title: 'm.title',
      async render() {
        const notice = needWalletNotice(t('m.connect'));
        if (!app.config?.chain) return [notice];
        const listings = await app.wallet.listings();
        const fee = await app.wallet.marketFee();
        const out = [el('p', {}, t('m.intro', { fee: fee / 100 }))];
        if (notice) out.push(notice);
        if (!listings.length) out.push(el('div', { class: 'notice info' }, t('m.empty')));
        const me = app.wallet.address?.toLowerCase();
        out.push(
          el(
            'div',
            { class: 'ship-grid' },
            listings.map((l) => {
              const key = SHIP_BY_CLASS[l.classId];
              const mine = l.seller.toLowerCase() === me;
              const b = el('button', { class: `btn ${mine ? 'ghost' : 'primary'} small` }, mine ? t('m.withdraw') : t('m.buy', { p: fmtRift(l.price), sym: 'RIFT' }));
              b.addEventListener('click', async () => {
                if (!app.wallet.connected && !(await app.connectWallet())) return;
                if (mine) act(b, t('m.withdrawing'), () => app.wallet.cancelListing(l.tokenId), t('m.withdrawn'));
                else act(b, t('h.buying'), () => app.wallet.buy(l.tokenId, l.price), t('m.bought', { id: l.tokenId }));
              });
              return shipCard({ key, level: l.level, tokenId: l.tokenId, extra: el('span', { class: 'meta' }, t('m.seller', { a: shortAddr(l.seller) })), actions: [b] });
            })
          )
        );
        return out;
      }
    },

    arena: {
      kicker: 'a.kicker',
      title: 'a.title',
      async render() {
        if (!app.online) return [serverNotice(t('a.server'))];
        const out = [el('p', {}, t('a.intro'))];
        const { tournaments } = await app.api.arena();
        const tour = tournaments.find((x) => !x.settled && x.endsAt * 1000 > Date.now());
        if (!tour) {
          out.push(el('div', { class: 'notice info' }, t('a.none')));
        } else {
          const oc = tour.onchain;
          const left = Math.max(0, tour.endsAt - Math.floor(Date.now() / 1000));
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat(t('a.pool'), oc ? `${num(oc.pool)} RIFT` : '—', 'gold'),
              stat(t('a.fee'), oc ? `${num(oc.entryFee)} RIFT` : '—'),
              stat(t('a.pilots'), oc ? oc.entrants : '—', 'cyan'),
              stat(t('a.closes'), `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`)
            ])
          );
          if (oc) {
            out.push(el('p', { class: 'hint' }, t('a.split', { rake: oc.rakeBps / 100, burn: oc.burnBps / 100, top: oc.payoutBps.length, first: oc.payoutBps[0] / 100 })));
          }
          const notice = needWalletNotice(t('a.connect'));
          if (notice) out.push(notice);
          else {
            const st = await app.api.arenaStatus();
            if (st.entered) {
              out.push(el('button', { class: 'btn secondary big', onclick: () => app.startRun('arena') }, t('a.play')));
            } else {
              const b = el('button', { class: 'btn primary big' }, t('a.enter', { fee: oc ? num(oc.entryFee) : '', sym: 'RIFT' }));
              b.addEventListener('click', () => act(b, t('a.entering'), () => app.wallet.enterArena(tour.id, parseEther(String(oc.entryFee))), t('a.entered')));
              out.push(b);
            }
          }
          out.push(el('h3', {}, t('a.standings')));
          out.push(
            tour.ranking.length
              ? rankingTable(tour.ranking.map((r) => ({ ...r, ship: 'spark' })), app.profile?.wallet ? shortAddr(app.profile.wallet) : null, 'wallet')
              : el('p', { class: 'hint' }, t('a.noScores'))
          );
        }
        const past = tournaments.filter((x) => x.settled).slice(0, 3);
        if (past.length) {
          out.push(el('h3', {}, t('a.past')));
          for (const p of past) {
            out.push(el('p', { class: 'hint' }, t('a.pastRow', { id: p.id, name: p.ranking[0]?.name ?? '—', score: fmtNum(p.ranking[0]?.score ?? 0) })));
          }
        }
        return out;
      }
    },

    ranking: {
      kicker: 'r.kicker',
      title: 'r.title',
      async render() {
        if (!app.online) return staticRanking();
        const wrap = el('div', {});
        const tabs = el('div', { class: 'tabs' });
        const load = async (scope) => {
          [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
          wrap.replaceChildren(el('p', { class: 'hint' }, t('sheet.loading')));
          const { entries } = await app.api.leaderboard(scope);
          wrap.replaceChildren(
            entries.length ? rankingTable(entries, app.profile?.name, 'name') : el('div', { class: 'notice info' }, t('r.empty'))
          );
        };
        for (const [scope, label] of [['daily', t('r.today')], ['challenge', t('r.challenge')], ['all', t('r.all')]]) {
          tabs.append(el('button', { 'data-scope': scope, onclick: () => load(scope) }, label));
        }
        load('daily');
        return [tabs, wrap];
      }
    },

    vault: {
      kicker: 'v.kicker',
      title: 'v.title',
      async render() {
        if (!app.online) return [serverNotice(t('v.server'))];
        const p = app.profile;
        const cfg = app.config;
        const out = [];
        out.push(
          el('div', { class: 'stat-grid' }, [
            stat(t('v.yours'), fmtNum(p?.shards ?? 0), 'gold'),
            stat(t('v.rate'), `1 ◆ = ${cfg?.riftPerShard ?? 1} RIFT`),
            stat(t('v.min'), `${cfg?.minClaimShards ?? 100} ◆`),
            stat(t('v.balance'), app.balances ? fmtRift(app.balances.rift) : '—', 'cyan')
          ])
        );
        const notice = needWalletNotice(t('v.connect'));
        if (notice) {
          out.push(notice);
          return out;
        }
        const eco = await app.api.economy().catch(() => null);
        if (eco?.vault) {
          out.push(el('p', { class: 'hint' }, t('v.today', { left: num(eco.vault.remainingToday), budget: num(eco.vault.dailyBudget), cap: num(eco.vault.maxPerPlayer) })));
        }
        const inputEl = el('input', { type: 'number', min: cfg.minClaimShards, step: 1, value: Math.max(cfg.minClaimShards, p?.shards ?? 0) });
        const btn = el('button', { class: 'btn gold' }, t('v.claim'));
        btn.addEventListener('click', () =>
          act(btn, t('v.signing'), async () => {
            const res = await app.api.claim(Number(inputEl.value));
            toast(t('v.signed'), 'gold');
            await app.wallet.claim(res.claim);
          }, t('v.received'))
        );
        out.push(el('div', { class: 'field' }, [inputEl, btn]));
        out.push(el('p', { class: 'hint' }, t('v.voucher')));
        const claims = p?.claims ?? [];
        if (claims.length) {
          out.push(el('h3', {}, t('v.history')));
          out.push(
            el(
              'div',
              { class: 'claim-list' },
              claims.map((c) => {
                const statusLabel = { pending: t('v.pending'), paid: t('v.paid'), expired: t('v.expired') }[c.status];
                const row = el('div', { class: 'claim-item' }, [
                  el('span', {}, `${fmtNum(c.shards)} ◆ → ${fmtRift(BigInt(c.amountWei))} RIFT`),
                  el('span', { class: `status ${c.status}` }, statusLabel)
                ]);
                if (c.status === 'pending' && c.signature && c.deadline * 1000 > Date.now()) {
                  const b = el('button', { class: 'btn ghost small' }, t('v.collect'));
                  b.addEventListener('click', () => act(b, t('v.collecting'), () => app.wallet.claim(c), t('v.receivedShort')));
                  row.append(b);
                }
                return row;
              })
            )
          );
        }
        return out;
      }
    },

    economy: {
      kicker: 'e.kicker',
      title: 'e.title',
      async render() {
        const eco = app.online ? await app.api.economy().catch(() => null) : null;
        const out = [el('p', {}, t('e.supply')), el('h3', {}, t('e.alloc'))];
        const alloc = [
          [t('e.a1'), 40, '#4de8ff'],
          [t('e.a2'), 20, '#9d6bff'],
          [t('e.a3'), 15, '#4dff9a'],
          [t('e.a4'), 15, '#ff4dd2'],
          [t('e.a5'), 10, '#ffc94d']
        ];
        out.push(
          el('div', { class: 'alloc' }, [
            el('div', { class: 'alloc-bar' }, alloc.map(([, p, c]) => el('i', { style: `width:${p}%;background:${c}` }))),
            el('div', { class: 'alloc-legend' }, alloc.map(([n, p, c]) => el('span', { style: `--c:${c}` }, `${p}% ${n}`)))
          ])
        );
        out.push(el('h3', {}, t('e.emission')));
        if (eco?.vault) {
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat(t('e.budget'), num(eco.vault.dailyBudget), 'cyan'),
              stat(t('e.remaining'), num(eco.vault.remainingToday)),
              stat(t('e.vault'), num(eco.vault.balance, { maximumFractionDigits: 0 }), 'gold'),
              stat(t('e.cap'), num(eco.vault.maxPerPlayer))
            ])
          );
        }
        out.push(el('p', { class: 'hint' }, t('e.halving')));
        out.push(el('h3', {}, t('e.where')));
        out.push(
          el('table', { class: 'table' }, [
            el('tr', {}, [el('th', {}, t('e.action')), el('th', {}, t('e.burn')), el('th', {}, t('e.pool')), el('th', {}, t('e.project'))]),
            el('tr', {}, [el('td', {}, t('e.rowForge')), el('td', {}, '40%'), el('td', {}, '30%'), el('td', {}, '30%')]),
            el('tr', {}, [el('td', {}, t('e.rowArena')), el('td', {}, '5%'), el('td', {}, t('e.rowArenaPool')), el('td', {}, '10%')]),
            el('tr', {}, [el('td', {}, t('e.rowMarket')), el('td', {}, '—'), el('td', {}, '—'), el('td', {}, t('e.rowMarketFee'))])
          ])
        );
        if (eco) {
          out.push(el('h3', {}, t('e.activity')));
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat(t('e.players'), fmtNum(eco.players)),
              stat(t('e.verified'), fmtNum(eco.stats.verifiedRuns), 'cyan'),
              stat(t('e.rejected'), fmtNum(eco.stats.rejectedRuns)),
              stat(t('e.issued'), fmtNum(eco.stats.shardsIssued), 'gold')
            ])
          );
        }
        if (app.config?.chain) {
          if (app.wallet?.connected) {
            const b = el('button', { class: 'btn ghost small' }, t('e.watch', { sym: tokenSymbol() }));
            b.addEventListener('click', () => app.wallet.watchToken().catch((err) => toast(explainError(err), 'err')));
            out.push(b);
          }
          out.push(el('h3', {}, t('e.contracts')));
          const ex = app.config.chain.explorerUrl;
          out.push(
            el(
              'table',
              { class: 'table' },
              Object.entries(app.config.chain.contracts).map(([k, v]) =>
                el('tr', {}, [el('td', {}, k), el('td', {}, ex ? el('a', { href: `${ex}/address/${v}`, target: '_blank', rel: 'noopener', style: 'color:var(--cyan)' }, shortAddr(v)) : shortAddr(v))])
              )
            )
          );
        }
        return out;
      }
    },

    profile: {
      kicker: 'tal.kicker',
      title: 'tal.title',
      async render() {
        if (app.online) await app.refreshProfile();
        const pl = app.pilot();
        const out = [el('p', {}, t('tal.intro'))];
        out.push(
          el('div', { class: 'stat-grid' }, [
            stat(t('tal.cores'), `${fmtNum(pl.cores)} ✦`, 'gold'),
            stat(t('st.streak'), pl.streak === 1 ? t('st.day') : t('st.days', { n: pl.streak }))
          ])
        );
        out.push(
          el(
            'div',
            { class: 'talent-grid' },
            TALENT_ORDER.map((id) => {
              const lv = pl.talents[id] ?? 0;
              const color = TALENTS[id].color;
              const maxed = lv >= TALENT_MAX;
              const cost = maxed ? 0 : talentCost(lv + 1);
              const b = el('button', { class: 'btn gold small', disabled: maxed || pl.cores < cost }, maxed ? t('tal.max') : t('tal.upgrade', { c: fmtNum(cost) }));
              b.addEventListener('click', async () => {
                b.disabled = true;
                try {
                  const n = await app.upgradeTalent(id);
                  app.audio?.play?.('choose');
                  toast(t('tal.done', { name: tx.talentName(id), n }), 'ok');
                } catch (err) {
                  toast(err.message === 'poor' ? t('tal.poor') : explainError(err), 'err');
                }
                open('profile');
              });
              const ico = iconCopy(TALENT_ICON[id], color, 96);
              ico.classList.add('ico');
              return el('div', { class: `talent${maxed ? ' maxed' : ''}`, style: `--accent:${color}` }, [
                ico,
                el('b', {}, tx.talentName(id)),
                el('span', { class: 'meta' }, t('tal.perLevel', { desc: tx.talentDesc(id) })),
                el('div', { class: 'pips' }, Array.from({ length: TALENT_MAX }, (_, k) => el('i', { class: k < lv ? 'on' : '' }))),
                b
              ]);
            })
          )
        );
        out.push(el('p', { class: 'hint' }, `${t('tal.note')}${pl.online ? '' : ` ${t('tal.local')}`}`));

        const st = pl.stats;
        if (!pl.online) {
          out.push(el('h3', {}, t('tal.stats')));
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat(t('st.runs'), fmtNum(st.runs)),
              stat(t('st.best'), fmtNum(st.bestScore), 'cyan'),
              stat(t('st.bestTime'), fmtTime(st.bestTime)),
              stat(t('st.kills'), fmtNum(st.kills)),
              stat(t('st.bosses'), fmtNum(st.bosses)),
              stat(t('st.victories'), fmtNum(st.victories))
            ])
          );
          // Llevar el progreso a otro dispositivo o navegador con un link.
          const move = el('button', { class: 'btn ghost small' }, t('mv.btn'));
          move.addEventListener('click', async () => {
            const link = await continueLink();
            try {
              if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'RIFTFALL', url: link });
              else {
                await navigator.clipboard.writeText(link);
                toast(t('mv.copied'), 'ok');
              }
            } catch {
              /* compartir cancelado */
            }
          });
          out.push(el('h3', {}, t('mv.title')), el('p', { class: 'hint' }, t('mv.text')), move);
          return out;
        }

        // En línea: perfil del servidor (nombre, estadísticas verificadas y wallet).
        const p = app.profile;
        const nameIn = el('input', { value: p.name, maxlength: 16 });
        const save = el('button', { class: 'btn ghost small' }, t('p.save'));
        save.addEventListener('click', async () => {
          try {
            app.profile = await app.api.setName(nameIn.value);
            toast(t('p.saved'), 'ok');
            app.updateMenu();
          } catch (err) {
            toast(err.message, 'err');
          }
        });
        out.push(el('h3', {}, t('tal.stats')));
        out.push(el('div', { class: 'field' }, [nameIn, save]));
        out.push(
          el('div', { class: 'stat-grid' }, [
            stat(t('st.runs'), fmtNum(p.runs)),
            stat(t('st.best'), fmtNum(p.bestScore), 'cyan'),
            stat(t('st.bestTime'), fmtTime(p.bestTime)),
            stat(t('st.kills'), fmtNum(p.kills)),
            stat(t('st.bosses'), fmtNum(p.bosses)),
            stat(t('st.victories'), fmtNum(p.victories)),
            stat(t('st.lifetimeShards'), fmtNum(p.lifetimeShards), 'gold')
          ])
        );
        out.push(el('p', {}, p.wallet ? t('p.wallet', { a: p.wallet }) : t('p.guest')));
        if (!p.wallet && app.config?.chain) out.push(el('button', { class: 'btn primary', onclick: async () => (await app.connectWallet()) && open('profile') }, t('p.connect')));
        return out;
      }
    }
  };

  /** Panel del dueño: precios de cada nave y cobro de ventas. Solo lo ve la wallet dueña del contrato. */
  async function ownerPanel(catalog) {
    const out = [el('h3', {}, t('o.title')), el('p', { class: 'hint' }, t('o.intro', { sym: nativeSymbol() }))];
    const pending = await app.wallet.pendingSales().catch(() => 0n);
    if (pending > 0n) {
      const w = el('button', { class: 'btn gold small' }, t('o.withdraw', { v: trimAmount(formatEther(pending)), sym: nativeSymbol() }));
      w.addEventListener('click', () => act(w, t('o.saving'), () => app.wallet.withdrawSales(), t('o.withdrawn')));
      out.push(w);
    }
    const parse = (v) => {
      const n = String(v).trim().replace(',', '.');
      if (!/^\d+(\.\d+)?$/.test(n)) throw new Error(t('o.invalid'));
      return parseEther(n);
    };
    const rows = catalog.map((k) => {
      const native = el('input', { type: 'text', inputmode: 'decimal', value: formatEther(k.priceWei), 'aria-label': t('o.native', { sym: nativeSymbol() }) });
      const rift = el('input', { type: 'text', inputmode: 'decimal', value: formatEther(k.priceRift), 'aria-label': t('o.rift') });
      const save = el('button', { class: 'btn ghost small' }, t('o.save'));
      save.addEventListener('click', () => {
        let priceWei;
        let priceRift;
        try {
          priceWei = parse(native.value);
          priceRift = parse(rift.value);
        } catch (err) {
          toast(err.message, 'err');
          return;
        }
        act(save, t('o.saving'), () => app.wallet.setClass(k.classId, priceWei, priceRift, k.active), t('o.saved', { name: k.name }));
      });
      return el('div', { class: 'owner-row', 'data-class': String(k.classId) }, [
        el('b', {}, k.name),
        el('label', {}, [el('small', {}, nativeSymbol()), native]),
        el('label', {}, [el('small', {}, 'RIFT'), rift]),
        save
      ]);
    });
    out.push(el('div', { class: 'owner-grid', id: 'ownerPanel' }, rows));
    return out;
  }

  function serverNotice(text) {
    return el('div', { class: 'notice info' }, text);
  }

  function stat(label, value, cls = '') {
    return el('div', { class: 'stat' }, [el('small', {}, label), el('b', { class: cls }, String(value))]);
  }

  /**
   * Ranking sin servidor de recompensas: el compartido de la web publicada (todas las partidas,
   * hoy e histórico) y el del Desafío del Día. Cada partida la verifica la propia web.
   */
  async function staticRanking() {
    if (!WORLD) return [serverNotice(t('r.server'))];
    const me = await myPublicId().catch(() => null);
    const wrap = el('div', {});
    const tabs = el('div', { class: 'tabs' });
    const show = (entries) => {
      if (!entries.length) return wrap.replaceChildren(el('div', { class: 'notice info' }, t('r.empty')));
      const mine = entries.findIndex((e) => e.id === me);
      wrap.replaceChildren(
        rankingTable(entries, me, 'id'),
        el('p', { class: 'hint' }, mine >= 0 ? t('rk.youAre', { n: mine + 1 }) : t('rk.play'))
      );
    };
    const load = async (scope) => {
      [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
      wrap.replaceChildren(el('p', { class: 'hint' }, t('sheet.loading')));
      try {
        if (scope === 'challenge') show((await fetchWorldDaily(dailyNumber())).entries.map((e) => ({ ...e, ship: 'spark' })));
        else {
          const board = await fetchRunBoard();
          show(scope === 'all' ? board.all : board.today);
        }
      } catch {
        wrap.replaceChildren(el('div', { class: 'notice info' }, t('rk.err')));
      }
    };
    for (const [scope, label] of [['daily', t('r.today')], ['challenge', t('r.challenge')], ['all', t('r.all')]]) {
      tabs.append(el('button', { 'data-scope': scope, onclick: () => load(scope) }, label));
    }
    load('daily');
    return [el('p', {}, t('rk.intro')), tabs, wrap];
  }

  function rankingTable(entries, me, key) {
    return el('table', { class: 'table' }, [
      el('tr', {}, [el('th', {}, '#'), el('th', {}, t('r.pilot')), el('th', {}, t('r.ship')), el('th', { class: 'num' }, t('r.time')), el('th', { class: 'num' }, t('r.score'))]),
      ...entries.map((e, i) =>
        el('tr', { class: me && e[key] === me ? 'me' : '' }, [
          el('td', {}, el('span', { class: `rank r${i + 1}` }, String(i + 1))),
          el('td', {}, e.name ?? e.wallet ?? '—'),
          el('td', {}, SHIPS[e.ship]?.name ?? '—'),
          el('td', { class: 'num' }, fmtTime(e.timeSec ?? 0)),
          el('td', { class: 'num' }, fmtNum(e.score))
        ])
      )
    ]);
  }

  return { open, close };
}

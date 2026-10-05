// Paneles laterales: Hangar, Mercado, Arena, Ranking, Canje, Economía y Piloto.

import { formatEther, parseEther } from 'ethers';
import { SHIPS, SHIP_BY_CLASS, shipYield } from '../sim/index.js';
import { drawShipPreview } from './sprites.js';
import { explainError } from './wallet.js';
import { $, el, toast, fmtTime, fmtNum, shortAddr, fmtRift } from './dom.js';

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

  function frame(kicker, title) {
    $('#sheetKicker').textContent = kicker;
    $('#sheetTitle').textContent = title;
    body.replaceChildren(el('p', { class: 'hint' }, 'Cargando…'));
    sheet.classList.remove('hidden');
  }

  async function open(name) {
    current = name;
    cancelAnimationFrame(anim);
    const view = VIEWS[name];
    if (!view) return;
    frame(view.kicker, view.title);
    try {
      const nodes = await view.render();
      if (current === name) body.replaceChildren(...nodes.filter(Boolean));
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
      return el('div', { class: 'notice' }, 'Este servidor aún no tiene la blockchain configurada: puedes jugar con la nave SPARK como invitado. El creador debe desplegar los contratos (ver README).');
    }
    if (!app.wallet?.connected) {
      return el('div', { class: 'notice info' }, [
        el('p', {}, text),
        el('button', { class: 'btn primary small', style: 'margin-top:10px', onclick: async () => (await app.connectWallet()) && open(current) }, 'Conectar wallet')
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
      tokenId ? el('span', { class: 'lv' }, `#${tokenId} · NV ${level}`) : tag ? el('span', { class: 'lv' }, tag) : null,
      shipCanvas(key),
      el('span', { class: 'tier' }, s.tier.toUpperCase()),
      el('b', {}, s.name),
      el('span', { class: 'meta' }, s.desc),
      el('span', { class: 'yield' }, `Recompensa x${shipYield(key, level).toFixed(2)}`),
      extra,
      actions.length ? el('div', { class: 'row' }, actions) : null
    ]);
  }

  // ------------------------------------------------------------------ vistas

  const VIEWS = {
    hangar: {
      kicker: 'NAVES',
      title: 'Hangar',
      async render() {
        const out = [];
        const sel = app.ship;
        const pick = (choice) => () => {
          app.selectShip(choice);
          toast(`${SHIPS[choice.key].name} lista para despegar`, 'ok');
          open('hangar');
        };
        out.push(el('p', {}, 'La nave define tu arma inicial, tus estadísticas y el multiplicador de Shards. Cada nivel de Forja suma +2% de daño y +3% de recompensa.'));
        out.push(el('h3', {}, 'Tus naves'));
        const mine = [
          shipCard({
            key: 'spark',
            selected: sel.key === 'spark',
            tag: 'GRATIS',
            actions: [el('button', { class: 'btn ghost small', onclick: pick({ key: 'spark', tokenId: null, level: 1 }) }, sel.key === 'spark' ? 'En uso' : 'Usar')]
          })
        ];
        if (app.config?.demoShips) {
          for (const key of Object.keys(SHIPS)) {
            if (key === 'spark') continue;
            mine.push(
              shipCard({
                key,
                tag: 'DEMO',
                selected: sel.key === key,
                actions: [el('button', { class: 'btn ghost small', onclick: pick({ key, tokenId: null, level: 1 }) }, sel.key === key ? 'En uso' : 'Probar')]
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
              el('button', { class: 'btn ghost small', onclick: pick({ key, tokenId: s.tokenId, level: s.level }) }, isSel ? 'En uso' : 'Usar')
            ];
            if (s.level < 10) {
              const cost = await app.wallet.forgeCost(s.level);
              const b = el('button', { class: 'btn gold small' }, `Forjar NV ${s.level + 1} · ${fmtRift(cost)} RIFT`);
              b.addEventListener('click', () => act(b, 'Forjando…', () => app.wallet.forge(s.tokenId, cost), `¡Nave #${s.tokenId} subió a nivel ${s.level + 1}!`));
              actions.push(b);
            }
            const sell = el('button', { class: 'btn ghost small' }, 'Vender');
            sell.addEventListener('click', () => {
              const v = prompt('Precio de venta en RIFT:', '1000');
              if (!v || !(Number(v) > 0)) return;
              act(sell, 'Publicando…', () => app.wallet.list(s.tokenId, parseEther(String(v))), 'Nave publicada en el Mercado');
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

        out.push(el('h3', {}, 'Astillero · naves NFT'));
        const notice = needWalletNotice('Conecta tu wallet para comprar naves NFT. Son tuyas: puedes usarlas, forjarlas o venderlas en el Mercado.');
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
                const b = el('button', { class: 'btn primary small', disabled: !k.active || left <= 0 }, `${formatEther(k.priceWei)} ETH`);
                b.addEventListener('click', async () => {
                  if (!app.wallet.connected && !(await app.connectWallet())) return;
                  act(b, 'Comprando…', () => app.wallet.mint(k.classId, 'eth', k.priceWei), `¡${k.name} es tuya!`);
                });
                actions.push(b);
              }
              if (k.priceRift > 0n) {
                const b = el('button', { class: 'btn gold small', disabled: !k.active || left <= 0 }, `${fmtRift(k.priceRift)} RIFT`);
                b.addEventListener('click', async () => {
                  if (!app.wallet.connected && !(await app.connectWallet())) return;
                  act(b, 'Comprando…', () => app.wallet.mint(k.classId, 'rift', k.priceRift), `¡${k.name} es tuya!`);
                });
                actions.push(b);
              }
              return shipCard({
                key,
                extra: el('span', { class: 'meta' }, left > 0 ? `${fmtNum(left)} de ${fmtNum(k.maxSupply)} disponibles` : 'AGOTADA'),
                actions
              });
            });
            out.push(el('div', { class: 'ship-grid' }, cards));
            out.push(el('p', { class: 'hint' }, 'Los pagos en RIFT se reparten: 40% se quema, 30% vuelve al pool de recompensas de los jugadores y 30% a la tesorería del proyecto.'));
          }
        }
        return out;
      }
    },

    market: {
      kicker: 'P2P',
      title: 'Mercado',
      async render() {
        const notice = needWalletNotice('Conecta tu wallet para comprar y vender naves con otros pilotos.');
        if (!app.config?.chain) return [notice];
        const listings = await app.wallet.listings();
        const fee = await app.wallet.marketFee();
        const out = [el('p', {}, `Compra naves de otros jugadores pagando en RIFT. Comisión del mercado: ${fee / 100}% (la paga el vendedor). Sin custodia: la nave queda en la wallet del vendedor hasta la venta.`)];
        if (notice) out.push(notice);
        if (!listings.length) out.push(el('div', { class: 'notice info' }, 'No hay naves en venta ahora mismo. Publica la tuya desde el Hangar.'));
        const me = app.wallet.address?.toLowerCase();
        out.push(
          el(
            'div',
            { class: 'ship-grid' },
            listings.map((l) => {
              const key = SHIP_BY_CLASS[l.classId];
              const mine = l.seller.toLowerCase() === me;
              const b = el('button', { class: `btn ${mine ? 'ghost' : 'primary'} small` }, mine ? 'Retirar' : `Comprar · ${fmtRift(l.price)} RIFT`);
              b.addEventListener('click', async () => {
                if (!app.wallet.connected && !(await app.connectWallet())) return;
                if (mine) act(b, 'Retirando…', () => app.wallet.cancelListing(l.tokenId), 'Anuncio retirado');
                else act(b, 'Comprando…', () => app.wallet.buy(l.tokenId, l.price), `¡Compraste la nave #${l.tokenId}!`);
              });
              return shipCard({ key, level: l.level, tokenId: l.tokenId, extra: el('span', { class: 'meta' }, `Vende ${shortAddr(l.seller)}`), actions: [b] });
            })
          )
        );
        return out;
      }
    },

    arena: {
      kicker: 'TORNEOS',
      title: 'Arena',
      async render() {
        const out = [
          el('p', {}, 'Paga la inscripción en RIFT y compite por el bote. Todos usan la nave SPARK (habilidad pura). Cuenta tu mejor puntaje; puedes jugar todas las veces que quieras hasta el cierre.')
        ];
        const { tournaments } = await app.api.arena();
        const t = tournaments.find((x) => !x.settled && x.endsAt * 1000 > Date.now());
        if (!t) {
          out.push(el('div', { class: 'notice info' }, 'No hay un torneo abierto en este momento. ¡Vuelve pronto!'));
        } else {
          const oc = t.onchain;
          const left = Math.max(0, t.endsAt - Math.floor(Date.now() / 1000));
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat('BOTE', oc ? `${Number(oc.pool).toLocaleString('es')} RIFT` : '—', 'gold'),
              stat('INSCRIPCIÓN', oc ? `${Number(oc.entryFee).toLocaleString('es')} RIFT` : '—'),
              stat('PILOTOS', oc ? oc.entrants : '—', 'cyan'),
              stat('CIERRA EN', `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`)
            ])
          );
          if (oc) {
            out.push(el('p', { class: 'hint' }, `Del bote: ${oc.rakeBps / 100}% para el proyecto, ${oc.burnBps / 100}% se quema y el resto se reparte entre el top ${oc.payoutBps.length} (1º: ${oc.payoutBps[0] / 100}%). Lo no repartido vuelve al pool de recompensas.`));
          }
          const notice = needWalletNotice('Conecta tu wallet para inscribirte en la Arena.');
          if (notice) out.push(notice);
          else {
            const st = await app.api.arenaStatus();
            if (st.entered) {
              out.push(el('button', { class: 'btn secondary big', onclick: () => app.startRun('arena') }, 'JUGAR ARENA'));
            } else {
              const b = el('button', { class: 'btn primary big' }, `Inscribirme · ${oc ? Number(oc.entryFee).toLocaleString('es') : ''} RIFT`);
              b.addEventListener('click', () => act(b, 'Inscribiendo…', () => app.wallet.enterArena(t.id, parseEther(String(oc.entryFee))), '¡Inscrito! Ya puedes jugar la Arena'));
              out.push(b);
            }
          }
          out.push(el('h3', {}, 'Clasificación'));
          out.push(
            t.ranking.length
              ? rankingTable(t.ranking.map((r) => ({ ...r, ship: 'spark' })), app.profile?.wallet ? shortAddr(app.profile.wallet) : null, 'wallet')
              : el('p', { class: 'hint' }, 'Aún no hay puntajes en este torneo. ¡El primero marca el ritmo!')
          );
        }
        const past = tournaments.filter((x) => x.settled).slice(0, 3);
        if (past.length) {
          out.push(el('h3', {}, 'Torneos anteriores'));
          for (const p of past) {
            out.push(el('p', { class: 'hint' }, `#${p.id} · ganador: ${p.ranking[0]?.name ?? '—'} (${fmtNum(p.ranking[0]?.score ?? 0)} pts)`));
          }
        }
        return out;
      }
    },

    ranking: {
      kicker: 'TOP PILOTOS',
      title: 'Ranking',
      async render() {
        const wrap = el('div', {});
        const tabs = el('div', { class: 'tabs' });
        const load = async (scope) => {
          [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
          wrap.replaceChildren(el('p', { class: 'hint' }, 'Cargando…'));
          const { entries } = await app.api.leaderboard(scope);
          wrap.replaceChildren(
            entries.length ? rankingTable(entries, app.profile?.name, 'name') : el('div', { class: 'notice info' }, 'Todavía no hay partidas. ¡Sé el primero!')
          );
        };
        for (const [scope, label] of [['daily', 'HOY'], ['all', 'HISTÓRICO']]) {
          tabs.append(el('button', { 'data-scope': scope, onclick: () => load(scope) }, label));
        }
        load('daily');
        return [tabs, wrap];
      }
    },

    vault: {
      kicker: 'SHARDS → $RIFT',
      title: 'Canjear',
      async render() {
        const p = app.profile;
        const cfg = app.config;
        const out = [];
        out.push(
          el('div', { class: 'stat-grid' }, [
            stat('TUS SHARDS', fmtNum(p?.shards ?? 0), 'gold'),
            stat('TASA', `1 ◆ = ${cfg?.riftPerShard ?? 1} RIFT`),
            stat('MÍNIMO', `${cfg?.minClaimShards ?? 100} ◆`),
            stat('SALDO RIFT', app.balances ? fmtRift(app.balances.rift) : '—', 'cyan')
          ])
        );
        const notice = needWalletNotice('Conecta tu wallet para convertir tus Shards en tokens $RIFT reales.');
        if (notice) {
          out.push(notice);
          return out;
        }
        const eco = await app.api.economy().catch(() => null);
        if (eco?.vault) {
          out.push(el('p', { class: 'hint' }, `Emisión de hoy: quedan ${Number(eco.vault.remainingToday).toLocaleString('es')} de ${Number(eco.vault.dailyBudget).toLocaleString('es')} RIFT. Límite por jugador: ${Number(eco.vault.maxPerPlayer).toLocaleString('es')} RIFT/día.`));
        }
        const inputEl = el('input', { type: 'number', min: cfg.minClaimShards, step: 1, value: Math.max(cfg.minClaimShards, p?.shards ?? 0) });
        const btn = el('button', { class: 'btn gold' }, 'Canjear');
        btn.addEventListener('click', () =>
          act(btn, 'Firmando…', async () => {
            const res = await app.api.claim(Number(inputEl.value));
            toast('Vale firmado por el servidor. Confirma la transacción en tu wallet.', 'gold');
            await app.wallet.claim(res.claim);
          }, '¡$RIFT recibidos en tu wallet!')
        );
        out.push(el('div', { class: 'field' }, [inputEl, btn]));
        out.push(el('p', { class: 'hint' }, 'El servidor firma un vale (EIP-712) válido 1 hora. Si no lo cobras, vence y los Shards vuelven a tu cuenta automáticamente.'));
        const claims = p?.claims ?? [];
        if (claims.length) {
          out.push(el('h3', {}, 'Historial'));
          out.push(
            el(
              'div',
              { class: 'claim-list' },
              claims.map((c) => {
                const statusLabel = { pending: 'PENDIENTE', paid: 'COBRADO', expired: 'VENCIDO' }[c.status];
                const row = el('div', { class: 'claim-item' }, [
                  el('span', {}, `${fmtNum(c.shards)} ◆ → ${fmtRift(BigInt(c.amountWei))} RIFT`),
                  el('span', { class: `status ${c.status}` }, statusLabel)
                ]);
                if (c.status === 'pending' && c.signature && c.deadline * 1000 > Date.now()) {
                  const b = el('button', { class: 'btn ghost small' }, 'Cobrar');
                  b.addEventListener('click', () => act(b, 'Cobrando…', () => app.wallet.claim(c), '¡$RIFT recibidos!'));
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
      kicker: 'TRANSPARENCIA',
      title: 'Economía $RIFT',
      async render() {
        const eco = await app.api.economy().catch(() => null);
        const out = [
          el('p', {}, '$RIFT tiene un suministro fijo de 1.000.000.000. El contrato no permite crear más tokens, no cobra impuestos por transferencia y nadie puede congelar tu saldo.'),
          el('h3', {}, 'Distribución inicial')
        ];
        const alloc = [
          ['Recompensas de jugadores (vault con halving)', 40, '#4de8ff'],
          ['Tesorería (marketing, botes, alianzas)', 20, '#9d6bff'],
          ['Liquidez en DEX', 15, '#4dff9a'],
          ['Equipo (bloqueado: 6 meses + 24 lineal)', 15, '#ff4dd2'],
          ['Comunidad y airdrops', 10, '#ffc94d']
        ];
        out.push(
          el('div', { class: 'alloc' }, [
            el('div', { class: 'alloc-bar' }, alloc.map(([, p, c]) => el('i', { style: `width:${p}%;background:${c}` }))),
            el('div', { class: 'alloc-legend' }, alloc.map(([n, p, c]) => el('span', { style: `--c:${c}` }, `${p}% ${n}`)))
          ])
        );
        out.push(el('h3', {}, 'Emisión para jugadores'));
        if (eco?.vault) {
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat('PRESUPUESTO HOY', `${Number(eco.vault.dailyBudget).toLocaleString('es')}`, 'cyan'),
              stat('RESTANTE HOY', `${Number(eco.vault.remainingToday).toLocaleString('es')}`),
              stat('EN EL VAULT', `${Number(eco.vault.balance).toLocaleString('es', { maximumFractionDigits: 0 })}`, 'gold'),
              stat('TOPE/JUGADOR', `${Number(eco.vault.maxPerPlayer).toLocaleString('es')}`)
            ])
          );
        }
        out.push(el('p', { class: 'hint' }, 'La emisión diaria se reduce a la mitad cada 180 días. Parte de lo que se gasta en Forja, compras con RIFT y torneos vuelve al vault, alargando su vida.'));
        out.push(el('h3', {}, 'A dónde va cada RIFT gastado'));
        out.push(
          el('table', { class: 'table' }, [
            el('tr', {}, [el('th', {}, 'Acción'), el('th', {}, 'Quema'), el('th', {}, 'Pool jugadores'), el('th', {}, 'Proyecto')]),
            el('tr', {}, [el('td', {}, 'Forja / compra de naves en RIFT'), el('td', {}, '40%'), el('td', {}, '30%'), el('td', {}, '30%')]),
            el('tr', {}, [el('td', {}, 'Inscripción de Arena'), el('td', {}, '5%'), el('td', {}, 'premios no asignados'), el('td', {}, '10%')]),
            el('tr', {}, [el('td', {}, 'Venta en el Mercado'), el('td', {}, '—'), el('td', {}, '—'), el('td', {}, '5% comisión')])
          ])
        );
        if (eco) {
          out.push(el('h3', {}, 'Actividad'));
          out.push(
            el('div', { class: 'stat-grid' }, [
              stat('PILOTOS', fmtNum(eco.players)),
              stat('PARTIDAS VERIFICADAS', fmtNum(eco.stats.verifiedRuns), 'cyan'),
              stat('RECHAZADAS', fmtNum(eco.stats.rejectedRuns)),
              stat('SHARDS EMITIDOS', fmtNum(eco.stats.shardsIssued), 'gold')
            ])
          );
        }
        if (app.config?.chain) {
          out.push(el('h3', {}, 'Contratos'));
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
      kicker: 'PERFIL',
      title: 'Piloto',
      async render() {
        await app.refreshProfile();
        const p = app.profile;
        if (!p) return [el('div', { class: 'notice' }, 'Sin conexión con el servidor.')];
        const nameIn = el('input', { value: p.name, maxlength: 16 });
        const save = el('button', { class: 'btn ghost small' }, 'Guardar');
        save.addEventListener('click', async () => {
          try {
            app.profile = await app.api.setName(nameIn.value);
            toast('Nombre actualizado', 'ok');
            app.updateMenu();
          } catch (err) {
            toast(err.message, 'err');
          }
        });
        const out = [
          el('div', { class: 'field' }, [nameIn, save]),
          el('div', { class: 'stat-grid' }, [
            stat('PARTIDAS', fmtNum(p.runs)),
            stat('MEJOR PUNTAJE', fmtNum(p.bestScore), 'cyan'),
            stat('MEJOR TIEMPO', fmtTime(p.bestTime)),
            stat('BAJAS', fmtNum(p.kills)),
            stat('GUARDIANES', fmtNum(p.bosses)),
            stat('VICTORIAS', fmtNum(p.victories)),
            stat('SHARDS TOTALES', fmtNum(p.lifetimeShards), 'gold'),
            stat('RACHA', `${p.streak} días`)
          ])
        ];
        out.push(el('p', {}, p.wallet ? `Wallet vinculada: ${p.wallet}` : 'Juegas como invitado. Conecta una wallet para guardar tu progreso en ella y canjear Shards.'));
        if (!p.wallet && app.config?.chain) out.push(el('button', { class: 'btn primary', onclick: async () => (await app.connectWallet()) && open('profile') }, 'Conectar wallet'));
        out.push(el('h3', {}, 'Cómo se gana'));
        out.push(
          el('p', {}, 'Cada partida da Shards por los Guardianes y élites que derrotes, por el tiempo sobrevivido y por ganar. Las misiones diarias y la racha de días suman extra. Tu nave multiplica el botín.')
        );
        return out;
      }
    }
  };

  function stat(label, value, cls = '') {
    return el('div', { class: 'stat' }, [el('small', {}, label), el('b', { class: cls }, String(value))]);
  }

  function rankingTable(entries, me, key) {
    return el('table', { class: 'table' }, [
      el('tr', {}, [el('th', {}, '#'), el('th', {}, 'Piloto'), el('th', {}, 'Nave'), el('th', { class: 'num' }, 'Tiempo'), el('th', { class: 'num' }, 'Puntaje')]),
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

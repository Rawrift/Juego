// Simulador de la economía de RIFTFALL a 24 meses, en 3 escenarios.
//   node scripts/simulate-economy.mjs            -> tablas en consola
//   node scripts/simulate-economy.mjs --md       -> además escribe docs/PROYECCION.md
//
// Es un modelo de planificación, no una promesa: todos los supuestos están aquí arriba para
// que los ajustes con datos reales (retención, conversión, precio del token) tras el lanzamiento.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ supuestos comunes
const COMMON = {
  months: 24,
  dauRatio: 0.2, // jugadores diarios / mensuales
  shardsPerDauDay: 380, // ~4 partidas (~60 c/u) + misiones y racha (medido con el bot de balance)
  riftPerShard: 1,
  dailyEmission0: 1_000_000, // RewardVault: presupuesto inicial
  halvingMonths: 6, // 180 días
  maxClaimPerPlayerDay: 3000,
  vaultInitial: 400_000_000,
  avgShipBnb: 0.0388, // mezcla de catálogo en BNB: 60% Vanguard, 25% Phantom, 12% Tempest, 3% Leviathan
  repeatBuyRate: 0.004, // % de MAU existente que compra otra nave al mes (temporadas nuevas)
  forgePerHolderMonth: 1200, // RIFT gastados en Forja por poseedor de nave al mes
  forgeSplit: { burn: 0.4, vault: 0.3, treasury: 0.3 },
  marketTurnover: 0.06, // % de naves revendidas al mes
  marketAvgPrice: 4000, // RIFT
  marketFee: 0.05,
  externalRoyaltyShare: 0.5, // volumen en marketplaces externos relativo al interno (regalía 5%)
  arenaFee: 100,
  arenaRake: 0.1,
  arenaBurn: 0.05,
  sellRatio: 0.6, // fracción de RIFT canjeados que los jugadores venden
  lpFee: 0.003,
  ownerLpShare: 0.8, // el creador aporta la liquidez inicial y cobra la mayor parte de las comisiones LP
  infraBaseUsd: 60, // servidor + RPC + base de datos
  infraPerMauUsd: 0.003
};

const SCENARIOS = {
  conservador: { startMAU: 1_000, growth: 0.12, maxMAU: 20_000, payRate: 0.02, walletShare: 0.25, arenaShare: 0.04, riftUsd: 0.001, bnbUsd: 650 },
  base: { startMAU: 4_000, growth: 0.22, maxMAU: 100_000, payRate: 0.03, walletShare: 0.35, arenaShare: 0.06, riftUsd: 0.004, bnbUsd: 800 },
  optimista: { startMAU: 10_000, growth: 0.3, maxMAU: 300_000, payRate: 0.045, walletShare: 0.45, arenaShare: 0.09, riftUsd: 0.008, bnbUsd: 950 }
};

function simulate(sc) {
  const c = COMMON;
  let mau = sc.startMAU;
  let holders = 0;
  let vault = c.vaultInitial;
  const rows = [];
  for (let m = 1; m <= c.months; m++) {
    const prevMau = m === 1 ? 0 : mau;
    if (m > 1) mau = Math.min(sc.maxMAU, mau * (1 + sc.growth * Math.max(0.15, 1 - mau / sc.maxMAU)));
    const newPlayers = Math.max(0, mau - prevMau) + prevMau * 0.25; // altas netas + reemplazo de abandonos
    const dau = mau * c.dauRatio;
    const days = 30;

    // NFTs
    const buyers = newPlayers * sc.payRate + mau * c.repeatBuyRate;
    holders = Math.min(mau, holders * 0.92 + buyers);
    const nftBnb = buyers * c.avgShipBnb;

    // Emisión: demanda de canje vs. presupuesto del vault
    const halvings = Math.floor((m - 1) / c.halvingMonths);
    const budget = (c.dailyEmission0 / 2 ** halvings) * days;
    const claimers = dau * sc.walletShare;
    const demand = claimers * Math.min(c.maxClaimPerPlayerDay, c.shardsPerDauDay * c.riftPerShard) * days;
    const emitted = Math.min(demand, budget, vault);

    // Sumideros
    const forge = holders * c.forgePerHolderMonth;
    const arenaEntries = dau * sc.arenaShare * days;
    const arenaFees = arenaEntries * c.arenaFee;
    const marketVol = holders * c.marketTurnover * c.marketAvgPrice;
    const burned = forge * c.forgeSplit.burn + arenaFees * c.arenaBurn;
    const toVault = forge * c.forgeSplit.vault + arenaFees * 0.03; // ~3% del bote queda sin asignar
    vault = vault - emitted + toVault;

    // Ingresos del creador (USD)
    const usd = {
      nft: nftBnb * sc.bnbUsd,
      forge: forge * c.forgeSplit.treasury * sc.riftUsd,
      arena: arenaFees * c.arenaRake * sc.riftUsd,
      market: marketVol * c.marketFee * sc.riftUsd,
      royalties: marketVol * c.externalRoyaltyShare * 0.05 * sc.riftUsd,
      lp: 0
    };
    const sold = emitted * c.sellRatio;
    const bought = forge + arenaFees + marketVol * 0.3; // RIFT que los jugadores compran para gastar
    const dexVolume = (sold + bought) * sc.riftUsd;
    usd.lp = dexVolume * c.lpFee * c.ownerLpShare;
    const infra = c.infraBaseUsd + mau * c.infraPerMauUsd;
    const gross = Object.values(usd).reduce((a, b) => a + b, 0);

    rows.push({
      m,
      mau: Math.round(mau),
      dau: Math.round(dau),
      buyers: Math.round(buyers),
      holders: Math.round(holders),
      emitted,
      burned,
      toVault,
      vault,
      buySellRatio: sold > 0 ? bought / sold : 0,
      usd,
      gross,
      infra,
      net: gross - infra
    });
  }
  return rows;
}

const fmt = (n, d = 0) => Number(n).toLocaleString('es', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtM = (n) => `${fmt(n / 1e6, 1)} M`;
const usd = (n) => `$${fmt(n)}`;

function summarize(name, sc, rows) {
  const total = (k) => rows.reduce((a, r) => a + (typeof k === 'function' ? k(r) : r[k]), 0);
  const y1 = rows.slice(0, 12);
  const y2 = rows.slice(12);
  const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
  return {
    name,
    sc,
    rows,
    y1Net: sum(y1, (r) => r.net),
    y2Net: sum(y2, (r) => r.net),
    byLine: Object.fromEntries(Object.keys(rows[0].usd).map((k) => [k, total((r) => r.usd[k])])),
    emitted: total('emitted'),
    burned: total('burned'),
    vaultEnd: rows.at(-1).vault,
    avgRatio: sum(rows, (r) => r.buySellRatio) / rows.length
  };
}

const LABELS = {
  nft: 'Venta de naves NFT (BNB)',
  forge: 'Forja (30% a tesorería)',
  arena: 'Rake de Arena (10%)',
  market: 'Comisión del Mercado (5%)',
  royalties: 'Regalías ERC-2981 externas',
  lp: 'Comisiones de liquidez (DEX)'
};

const results = Object.entries(SCENARIOS).map(([name, sc]) => summarize(name, sc, simulate(sc)));

for (const r of results) {
  console.log(`\n=== Escenario ${r.name.toUpperCase()} (RIFT = $${r.sc.riftUsd}, BNB = $${r.sc.bnbUsd}) ===`);
  console.table(
    r.rows
      .filter((x) => [1, 3, 6, 9, 12, 18, 24].includes(x.m))
      .map((x) => ({
        mes: x.m,
        MAU: fmt(x.mau),
        compradores: fmt(x.buyers),
        'RIFT emitidos': fmtM(x.emitted),
        'RIFT quemados': fmtM(x.burned),
        'compra/venta': fmt(x.buySellRatio, 2),
        'ingreso bruto': usd(x.gross),
        'neto (−infra)': usd(x.net)
      }))
  );
  console.log(`Neto año 1: ${usd(r.y1Net)} · año 2: ${usd(r.y2Net)} · vault al final: ${fmtM(r.vaultEnd)} RIFT`);
}

if (process.argv.includes('--md')) {
  let md = '# Proyección económica de RIFTFALL (24 meses)\n\n';
  md += '> Generado con `npm run economy -- --md`. Es un **modelo de planificación**: los resultados dependen por completo de los supuestos ';
  md += '(adquisición de jugadores, conversión a pago y precio de $RIFT). No es una promesa de ingresos. Recalibra con datos reales a las 4–8 semanas del lanzamiento.\n\n';
  md += '## Supuestos por escenario\n\n| | Conservador | Base | Optimista |\n|---|---:|---:|---:|\n';
  const row = (label, f) => `| ${label} | ${results.map((r) => f(r.sc)).join(' | ')} |\n`;
  md += row('Jugadores mensuales iniciales', (s) => fmt(s.startMAU));
  md += row('Crecimiento mensual inicial', (s) => `${Math.round(s.growth * 100)}%`);
  md += row('Techo de jugadores mensuales', (s) => fmt(s.maxMAU));
  md += row('Nuevos jugadores que compran nave', (s) => `${(s.payRate * 100).toFixed(1)}%`);
  md += row('Jugadores con wallet que canjean', (s) => `${Math.round(s.walletShare * 100)}%`);
  md += row('Jugadores diarios en la Arena', (s) => `${Math.round(s.arenaShare * 100)}%`);
  md += row('Precio supuesto de $RIFT', (s) => `$${s.riftUsd}`);
  md += row('Precio supuesto de BNB', (s) => `$${fmt(s.bnbUsd)}`);
  md += '\nComunes: 20% de jugadores diarios sobre mensuales, 380 Shards/día por jugador activo, nave media 0,0388 BNB, ';
  md += '1.200 RIFT/mes en Forja por poseedor, 6% de naves revendidas al mes a 4.000 RIFT, 60% de los RIFT canjeados se venden, ';
  md += 'el creador posee el 80% de la liquidez del pool. Infraestructura: $60/mes + $0,003 por jugador mensual.\n\n';

  md += '## Resultado neto para el creador\n\n| | Conservador | Base | Optimista |\n|---|---:|---:|---:|\n';
  md += `| **Año 1 (neto)** | ${results.map((r) => `**${usd(r.y1Net)}**`).join(' | ')} |\n`;
  md += `| **Año 2 (neto)** | ${results.map((r) => `**${usd(r.y2Net)}**`).join(' | ')} |\n`;
  for (const k of Object.keys(LABELS)) md += `| ${LABELS[k]} (24 m) | ${results.map((r) => usd(r.byLine[k])).join(' | ')} |\n`;
  md += '\nNo incluye el valor del 15% del equipo (vesting) ni del 20% de tesorería: venderlos en el mercado mueve el precio, así que se tratan como reserva y no como ingreso.\n\n';

  md += '## Salud del token\n\n| | Conservador | Base | Optimista |\n|---|---:|---:|---:|\n';
  md += `| RIFT emitidos a jugadores (24 m) | ${results.map((r) => fmtM(r.emitted)).join(' | ')} |\n`;
  md += `| RIFT quemados (24 m) | ${results.map((r) => fmtM(r.burned)).join(' | ')} |\n`;
  md += `| RIFT que quedan en el vault | ${results.map((r) => fmtM(r.vaultEnd)).join(' | ')} |\n`;
  md += `| Ratio medio compra/venta de jugadores | ${results.map((r) => fmt(r.avgRatio, 2)).join(' | ')} |\n`;
  md += '\nUn ratio compra/venta por debajo de 1 significa que los jugadores venden más RIFT de los que compran para gastar: presión bajista sobre el precio. ';
  md += 'Las palancas para corregirlo están en `docs/ECONOMIA.md` (sección 8).\n\n';

  for (const r of results) {
    md += `### Detalle mensual · ${r.name}\n\n| Mes | Jugadores/mes | Compradores | RIFT emitidos | RIFT quemados | Compra/venta | Bruto | Neto |\n|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
    for (const x of r.rows) {
      md += `| ${x.m} | ${fmt(x.mau)} | ${fmt(x.buyers)} | ${fmtM(x.emitted)} | ${fmtM(x.burned)} | ${fmt(x.buySellRatio, 2)} | ${usd(x.gross)} | ${usd(x.net)} |\n`;
    }
    md += '\n';
  }
  const out = path.join(ROOT, 'docs', 'PROYECCION.md');
  fs.writeFileSync(out, md);
  console.log(`\nEscrito ${path.relative(process.cwd(), out)}`);
}

// Ventana "Cuenta Rift", la misma en RIFTFALL y en Rift Cargo: estado de la cuenta, nombre, proteger
// con huella / Face ID, entrar desde otro dispositivo, wallet, los dos juegos del universo y las compras.

import './account.css';
import {
  account, isOnline, start, loginWallet, addPasskey, loginPasskey, setName, logout, passkeysSupported, onAccount, syncPurchases, reloadForAccount, fetchStats, api
} from './account.js';
import { injected } from '../client/injected.js';
import { openInMetaMask, setWalletFallback } from './open-in-metamask.js';
import { remoteWallet, walletProvider } from './wallet.js';
import { STYLE_ITEMS } from '../shared/cargo-style.js';
import { fiatOn, fiatOwnerLabel, openFiatOwner } from './fiat-ui.js';

const REVIEW = {
  es: { title: 'Reconocer una compra anterior', sub: 'Para pagos BNB sin pedido previo o pedidos BNB/USDT confirmados tarde. Revisá el comprobante: el pagador debe tener su wallet vinculada. Confirmás con una firma gratuita y queda registrado.',
    hash: 'Hash de la transacción', item: 'Artículo comprado', amount: 'BNB o USDT recibidos', reason: 'Motivo y comprobante de la compra', submit: 'Reconocer compra', done: 'Compra reconocida y registrada.',
    paint: 'Pintura', trail: 'Estela', ship: 'Nave', plates: 'Matrículas', sign: 'Cartel', pack: 'Pack de estilo', fleet: 'Flota Rift',
    error: 'No se pudo reconocer la compra. Revisá artículo, importe, pagador y confirmaciones del comprobante.' },
  en: { title: 'Recognize a previous purchase', sub: 'For BNB payments without a prior order or late BNB/USDT orders. Check the receipt: the payer must link their wallet. Confirm with a free signature; the decision is recorded.',
    hash: 'Transaction hash', item: 'Purchased item', amount: 'BNB or USDT received', reason: 'Reason and purchase evidence', submit: 'Recognize purchase', done: 'Purchase recognized and recorded.',
    paint: 'Paint', trail: 'Trail', ship: 'Ship', plates: 'License plates', sign: 'Sign', pack: 'Style pack', fleet: 'Rift fleet',
    error: 'Could not recognize the purchase. Check the item, amount, payer and receipt confirmations.' },
  pt: { title: 'Reconhecer uma compra anterior', sub: 'Para pagamentos BNB sem pedido prévio ou pedidos BNB/USDT confirmados tarde. Confira o comprovante: o pagador deve vincular a carteira. Confirme com uma assinatura gratuita; a decisão fica registrada.',
    hash: 'Hash da transação', item: 'Artigo comprado', amount: 'BNB ou USDT recebidos', reason: 'Motivo e comprovante da compra', submit: 'Reconhecer compra', done: 'Compra reconhecida e registrada.',
    paint: 'Pintura', trail: 'Rastro', ship: 'Nave', plates: 'Placas', sign: 'Letreiro', pack: 'Pacote de estilo', fleet: 'Frota Rift',
    error: 'Não foi possível reconhecer a compra. Confira artigo, valor, pagador e confirmações do comprovante.' }
};

const T = {
  es: {
    title: 'Cuenta Rift',
    sub: 'Una sola cuenta para RIFTFALL y Rift Cargo: tu progreso, tus puntajes y tus compras quedan guardados en la nube.',
    guest: 'Invitado',
    guestHint: 'Tu progreso ya se guarda en la nube, pero por ahora solo desde este dispositivo. Protegé la cuenta para no perderla y para jugar desde otro celular o compu.',
    safe: 'Cuenta protegida',
    safeHint: 'Entrás desde cualquier dispositivo con tu huella, Face ID o wallet.',
    offline: 'Sin conexión con el servidor: el juego sigue guardando en este dispositivo.',
    retry: 'Reintentar',
    name: 'Nombre en los rankings',
    save: 'Guardar',
    addPasskey: 'Proteger con huella o Face ID',
    addPasskeyMore: 'Sumar este dispositivo (huella o Face ID)',
    loginTitle: '¿Ya tenés cuenta en otro dispositivo?',
    loginPasskey: 'Entrar con huella o Face ID',
    wallet: 'Conectar wallet',
    walletHint: 'Con la wallet firmás un mensaje: no cuesta nada ni autoriza pagos.',
    passkeys: 'Huella / Face ID',
    wallets: 'Wallet',
    games: 'Universo Rift',
    rf: 'RIFTFALL',
    rfStat: 'Mejor puntaje: {score}',
    rfNone: 'Todavía no jugaste',
    cg: 'Rift Cargo',
    cgStat: 'Nivel {level} · ${earned} ganados',
    cgNone: 'Todavía no jugaste',
    play: 'Jugar',
    here: 'Estás acá',
    purchases: 'Compras',
    founder: 'Pase Fundador {tier}',
    styles: '{n} estéticos de Rift Cargo',
    tiers: { pilot: 'Piloto', gold: 'Oro', legend: 'Leyenda' },
    logout: 'Cerrar sesión en este dispositivo',
    logoutConfirm: '¿Cerrar sesión? Tu progreso queda en la cuenta y vas a poder volver a entrar con tu huella o tu wallet.',
    privacy: 'No usamos contraseñas. Tu huella o tu cara nunca salen de tu dispositivo: el celular solo nos confirma que sos vos.',
    ok: { passkey: 'Listo: tu cuenta quedó protegida con este dispositivo.', login: 'Entraste a tu cuenta. Cargando tu progreso…', wallet: 'Wallet conectada a tu cuenta.', name: 'Nombre guardado.' },
    err: {
      rejected: 'Cancelaste en la wallet.',
      cancelled: 'Se canceló.',
      noWallet: 'No hay wallet en este navegador.',
      'passkey-exists': 'Este dispositivo ya protege tu cuenta.',
      'passkey-unknown': 'Esa huella no corresponde a ninguna cuenta.',
      passkey: 'No se pudo verificar la huella.',
      signature: 'No se pudo verificar la firma.',
      mmconnect: 'No se pudo conectar con la wallet. Probá de nuevo o abrí el juego dentro de MetaMask.',
      expired: 'Se venció el pedido. Probá de nuevo.',
      offline: 'Sin conexión con el servidor.',
      generic: 'No se pudo completar: {msg}'
    },
    nudge: 'Protegé tu progreso',
    nudgeSub: 'Huella o Face ID, sin contraseñas',
    ownerBadge: 'Dueño',
    owner: 'Panel del dueño',
    ownerHint: 'Esta cuenta tiene la wallet del dueño: tenés todo desbloqueado gratis (Pase Fundador Leyenda, todos los estéticos y todas las naves exclusivas). Desde acá modificás tu partida.',
    ownerDone: 'Listo.',
    st: {
      open: 'Estadísticas de jugadores',
      title: 'Estadísticas',
      sub: 'Jugadores nuevos, de dónde vienen y compras. "Jugó" = tiene una partida guardada de verdad.',
      today: 'Hoy', week: '7 días', total: 'Total', sales: 'Compras',
      newp: 'nuevos', played: 'jugaron',
      days: 'Últimos 14 días', sources: 'De dónde vienen', places: 'Dónde están', devices: 'Dispositivo', games: 'Entraron por',
      recent: 'Últimos jugadores', buys: 'Últimas compras', none: 'Todavía nada.',
      direct: 'directo / sin datos', mobile: 'celular', desktop: 'compu', bot: 'robot (vista previa o buscador)',
      tip: 'Para saber de dónde viene cada uno, compartí el link con una etiqueta: riftfall.duckdns.org/?ref=tiktok (o ?ref=instagram, ?ref=whatsapp…). Los datos son desde hoy.',
      loading: 'Cargando…', error: 'No se pudieron traer las estadísticas.', back: 'Volver', refresh: 'Actualizar',
      ago: { m: 'hace {n} min', h: 'hace {n} h', d: 'hace {n} d' }
    },
    tools: {
      cores: '+5.000 Núcleos',
      talents: 'Talentos al máximo',
      rift: 'Todos los niveles del Rift',
      parts: 'Todas las piezas al máximo',
      credits: '+$100.000',
      level: 'Nivel máximo',
      upgrades: 'Todas las mejoras de la estación',
      evolve: 'Flota evolucionada (Mk III)'
    }
  },
  en: {
    title: 'Rift Account',
    sub: 'One account for RIFTFALL and Rift Cargo: your progress, scores and purchases are saved in the cloud.',
    guest: 'Guest',
    guestHint: 'Your progress is already saved in the cloud, but for now only this device can access it. Secure your account so you never lose it and can play from another phone or computer.',
    safe: 'Secured account',
    safeHint: 'Sign in from any device with your fingerprint, Face ID or wallet.',
    offline: 'No connection to the server: the game keeps saving on this device.',
    retry: 'Retry',
    name: 'Name on leaderboards',
    save: 'Save',
    addPasskey: 'Secure with fingerprint or Face ID',
    addPasskeyMore: 'Add this device (fingerprint or Face ID)',
    loginTitle: 'Already have an account on another device?',
    loginPasskey: 'Sign in with fingerprint or Face ID',
    wallet: 'Connect wallet',
    walletHint: 'With your wallet you sign a message: it costs nothing and authorizes no payments.',
    passkeys: 'Fingerprint / Face ID',
    wallets: 'Wallet',
    games: 'Rift universe',
    rf: 'RIFTFALL',
    rfStat: 'Best score: {score}',
    rfNone: 'Not played yet',
    cg: 'Rift Cargo',
    cgStat: 'Level {level} · ${earned} earned',
    cgNone: 'Not played yet',
    play: 'Play',
    here: 'You are here',
    purchases: 'Purchases',
    founder: 'Founder Pass {tier}',
    styles: '{n} Rift Cargo cosmetics',
    tiers: { pilot: 'Pilot', gold: 'Gold', legend: 'Legend' },
    logout: 'Sign out on this device',
    logoutConfirm: 'Sign out? Your progress stays in your account and you can sign back in with your fingerprint or wallet.',
    privacy: 'No passwords. Your fingerprint or face never leaves your device: your phone just confirms it is you.',
    ok: { passkey: 'Done: your account is now secured with this device.', login: 'Signed in. Loading your progress…', wallet: 'Wallet linked to your account.', name: 'Name saved.' },
    err: {
      rejected: 'You cancelled in your wallet.',
      cancelled: 'Cancelled.',
      noWallet: 'There is no wallet in this browser.',
      'passkey-exists': 'This device already secures your account.',
      'passkey-unknown': 'That fingerprint does not match any account.',
      passkey: 'Could not verify the fingerprint.',
      signature: 'Could not verify the signature.',
      mmconnect: 'Could not connect to the wallet. Try again or open the game inside MetaMask.',
      expired: 'The request expired. Try again.',
      offline: 'No connection to the server.',
      generic: 'Could not complete it: {msg}'
    },
    nudge: 'Secure your progress',
    nudgeSub: 'Fingerprint or Face ID, no passwords',
    ownerBadge: 'Owner',
    owner: 'Owner panel',
    ownerHint: 'This account has the owner wallet: everything is unlocked for free (Legend Founder Pass, every cosmetic and every exclusive ship). From here you can edit your save.',
    ownerDone: 'Done.',
    st: {
      open: 'Player stats',
      title: 'Stats',
      sub: 'New players, where they come from and purchases. "Played" = has a real saved game.',
      today: 'Today', week: '7 days', total: 'Total', sales: 'Purchases',
      newp: 'new', played: 'played',
      days: 'Last 14 days', sources: 'Where they come from', places: 'Where they are', devices: 'Device', games: 'Came in through',
      recent: 'Latest players', buys: 'Latest purchases', none: 'Nothing yet.',
      direct: 'direct / no data', mobile: 'phone', desktop: 'computer', bot: 'bot (link preview or crawler)',
      tip: 'To know where each player comes from, share the link with a tag: riftfall.duckdns.org/?ref=tiktok (or ?ref=instagram, ?ref=whatsapp…). Data starts today.',
      loading: 'Loading…', error: 'Could not load the stats.', back: 'Back', refresh: 'Refresh',
      ago: { m: '{n} min ago', h: '{n} h ago', d: '{n} d ago' }
    },
    tools: {
      cores: '+5,000 Cores',
      talents: 'Max all talents',
      rift: 'Unlock every Rift level',
      parts: 'Max all parts',
      credits: '+$100,000',
      level: 'Max level',
      upgrades: 'Every station upgrade',
      evolve: 'Evolve the fleet (Mk III)'
    }
  },
  pt: {
    title: 'Conta Rift',
    sub: 'Uma só conta para RIFTFALL e Rift Cargo: seu progresso, suas pontuações e suas compras ficam salvos na nuvem.',
    guest: 'Convidado',
    guestHint: 'Seu progresso já é salvo na nuvem, mas por enquanto só neste aparelho. Proteja a conta para não perdê-la e para jogar de outro celular ou computador.',
    safe: 'Conta protegida',
    safeHint: 'Entre de qualquer aparelho com digital, Face ID ou carteira.',
    offline: 'Sem conexão com o servidor: o jogo continua salvando neste aparelho.',
    retry: 'Tentar de novo',
    name: 'Nome nos rankings',
    save: 'Salvar',
    addPasskey: 'Proteger com digital ou Face ID',
    addPasskeyMore: 'Adicionar este aparelho (digital ou Face ID)',
    loginTitle: 'Já tem conta em outro aparelho?',
    loginPasskey: 'Entrar com digital ou Face ID',
    wallet: 'Conectar carteira',
    walletHint: 'Com a carteira você assina uma mensagem: não custa nada nem autoriza pagamentos.',
    passkeys: 'Digital / Face ID',
    wallets: 'Carteira',
    games: 'Universo Rift',
    rf: 'RIFTFALL',
    rfStat: 'Melhor pontuação: {score}',
    rfNone: 'Ainda não jogou',
    cg: 'Rift Cargo',
    cgStat: 'Nível {level} · ${earned} ganhos',
    cgNone: 'Ainda não jogou',
    play: 'Jogar',
    here: 'Você está aqui',
    purchases: 'Compras',
    founder: 'Passe Fundador {tier}',
    styles: '{n} itens visuais do Rift Cargo',
    tiers: { pilot: 'Piloto', gold: 'Ouro', legend: 'Lenda' },
    logout: 'Sair neste aparelho',
    logoutConfirm: 'Sair? Seu progresso fica na conta e você poderá entrar de novo com a digital ou a carteira.',
    privacy: 'Sem senhas. Sua digital ou seu rosto nunca saem do aparelho: o celular só nos confirma que é você.',
    ok: { passkey: 'Pronto: sua conta ficou protegida com este aparelho.', login: 'Você entrou na sua conta. Carregando seu progresso…', wallet: 'Carteira conectada à sua conta.', name: 'Nome salvo.' },
    err: {
      rejected: 'Você cancelou na carteira.',
      cancelled: 'Cancelado.',
      noWallet: 'Não há carteira neste navegador.',
      'passkey-exists': 'Este aparelho já protege sua conta.',
      'passkey-unknown': 'Essa digital não corresponde a nenhuma conta.',
      passkey: 'Não foi possível verificar a digital.',
      signature: 'Não foi possível verificar a assinatura.',
      mmconnect: 'Não foi possível conectar à carteira. Tente de novo ou abra o jogo dentro do MetaMask.',
      expired: 'O pedido expirou. Tente de novo.',
      offline: 'Sem conexão com o servidor.',
      generic: 'Não foi possível concluir: {msg}'
    },
    nudge: 'Proteja seu progresso',
    nudgeSub: 'Digital ou Face ID, sem senhas',
    ownerBadge: 'Dono',
    owner: 'Painel do dono',
    ownerHint: 'Esta conta tem a carteira do dono: tudo desbloqueado de graça (Passe Fundador Lenda, todos os itens visuais e todas as naves exclusivas). Daqui você modifica seu progresso.',
    ownerDone: 'Pronto.',
    st: {
      open: 'Estatísticas de jogadores',
      title: 'Estatísticas',
      sub: 'Jogadores novos, de onde vêm e compras. "Jogou" = tem uma partida salva de verdade.',
      today: 'Hoje', week: '7 dias', total: 'Total', sales: 'Compras',
      newp: 'novos', played: 'jogaram',
      days: 'Últimos 14 dias', sources: 'De onde vêm', places: 'Onde estão', devices: 'Dispositivo', games: 'Entraram por',
      recent: 'Últimos jogadores', buys: 'Últimas compras', none: 'Nada ainda.',
      direct: 'direto / sem dados', mobile: 'celular', desktop: 'computador', bot: 'robô (prévia de link ou buscador)',
      tip: 'Para saber de onde vem cada um, compartilhe o link com uma etiqueta: riftfall.duckdns.org/?ref=tiktok (ou ?ref=instagram, ?ref=whatsapp…). Os dados começam hoje.',
      loading: 'Carregando…', error: 'Não foi possível trazer as estatísticas.', back: 'Voltar', refresh: 'Atualizar',
      ago: { m: 'há {n} min', h: 'há {n} h', d: 'há {n} d' }
    },
    tools: {
      cores: '+5.000 Núcleos',
      talents: 'Talentos no máximo',
      rift: 'Todos os níveis do Rift',
      parts: 'Todas as peças no máximo',
      credits: '+$100.000',
      level: 'Nível máximo',
      upgrades: 'Todas as melhorias da estação',
      evolve: 'Frota evoluída (Mk III)'
    }
  }
};

const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ICON = {
  finger: 'M12 11c0 3.5-1 6.5-2.5 9 M7.5 5.5A7 7 0 0 1 19 11c0 2-.2 4-.7 6 M5 9a7 7 0 0 0-.2 1.7c0 2.4-.6 4.7-1.6 6.6 M9 11a3 3 0 0 1 6 0c0 3-.5 6-1.6 8.5 M15.7 20.5c.4-1.2.8-2.4 1-3.7',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  crown: 'M2 8l4 10h12l4-10-6 4-4-8-4 8z M6 21h12',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-9',
  back: 'M15 18l-6-6 6-6',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  x: 'M18 6 6 18 M6 6l12 12',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'
};
const icon = (k) => `<svg class="ra-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function cube() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 56 18 32 32 8 18z" fill="#4de8ff"/><path d="M8 18 32 32v28L8 46z" fill="#9d6bff"/><path d="M56 18 32 32v28l24-14z" fill="#ff4dd2"/><path d="M22 47 28 37l8 6" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Monta la ventana. `game` = 'riftfall' | 'cargo' (para marcar dónde estás); `lang()` da el idioma;
 * `toast(texto, tipo)` muestra avisos con el estilo del juego. `owner` = herramientas del Panel del
 * dueño de este juego ({ cores: fn, talents: fn, … }): solo se ven si la cuenta es del dueño.
 * `walletLink()` = link para abrir el juego dentro de MetaMask con la cuenta y el progreso (cuando
 * en este navegador no hay wallet, por ejemplo Safari o Chrome en el celular).
 */
export function createAccountUI({ game, lang = () => 'es', toast = () => {}, onChange = () => {}, owner = {}, walletLink }) {
  // "Abrir el juego dentro de MetaMask" (por si MetaMask Connect no anda) lleva la cuenta y el progreso.
  if (walletLink) setWalletFallback(walletLink);
  const root = document.createElement('div');
  root.className = 'ra-overlay';
  root.hidden = true;
  document.body.appendChild(root);
  let busy = null;
  // Estadísticas del dueño: 'main' (la cuenta) o 'stats'.
  let view = 'main';
  let stats = null;
  let statsErr = false;
  const tx = () => T[lang()] ?? T.es;

  function nf(n) {
    return new Intl.NumberFormat(lang() === 'en' ? 'en-US' : lang() === 'pt' ? 'pt-BR' : 'es-AR').format(Math.round(n || 0));
  }

  function games() {
    const L = tx();
    const p = readJson('riftfall.progress');
    const c = readJson('riftcargo.save')?.state;
    const row = (id, title, stat, href) => `<a class="ra-game ${game === id ? 'here' : ''}" href="${game === id ? '#' : href}" ${game === id ? 'data-ra="close"' : ''}>
      <span class="ra-game-name">${title}</span><small>${stat}</small><b>${game === id ? L.here : `${L.play} →`}</b></a>`;
    return row('riftfall', L.rf, p?.bestScore ? fill(L.rfStat, { score: nf(p.bestScore) }) : L.rfNone, '/')
      + row('cargo', L.cg, c ? fill(L.cgStat, { level: c.level ?? 1, earned: nf(c.stats?.earned ?? 0) }) : L.cgNone, '/cargo/');
  }

  /** Estadísticas de jugadores (solo el dueño). */
  function renderStats() {
    const L = tx();
    const S = L.st;
    const head = `<header class="ra-head"><button class="ra-x ra-back" data-ra="statsBack" aria-label="${S.back}">${icon('back')}</button>
      <div><h2>${S.title}</h2><p>${S.sub}</p></div>
      <button class="ra-x" data-ra="statsLoad" aria-label="${S.refresh}">${icon('refresh')}</button></header>`;
    if (!stats) return `<div class="ra-card ra-stats" role="dialog" aria-modal="true">${head}<p class="ra-note">${statsErr ? S.error : S.loading}</p></div>`;
    const { totals: tt, days, sources, countries, devices, games, recent, purchases } = stats;
    const pad = (n) => String(n).padStart(2, '0');
    const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayKey = dayKey(new Date());
    const weekAgo = dayKey(new Date(Date.now() - 6 * 86_400_000));
    const sum = (list, k) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const today = days.find((d) => d.d === todayKey) ?? { n: 0, played: 0 };
    const week = days.filter((d) => d.d >= weekAgo);
    const kpi = (label, big, small) => `<div class="ra-kpi"><small>${label}</small><b>${big}</b><span>${small}</span></div>`;
    const label = (k) => (k === 'directo' ? S.direct : k === 'mobile' ? S.mobile : k === 'desktop' ? S.desktop : k === 'bot' ? S.bot : k === 'riftfall' ? 'RIFTFALL' : k === 'cargo' ? 'Rift Cargo' : String(k).includes('/') ? String(k).split('/').slice(1).join(' / ').replace(/_/g, ' ') : k);
    const bars = (rows) => {
      if (!rows.length) return `<p class="ra-note">${S.none}</p>`;
      const max = Math.max(...rows.map((r) => r.n));
      return rows.map((r) => `<div class="ra-bar"><span>${esc(label(r.k))}</span><i><b style="width:${Math.round((r.n / max) * 100)}%"></b><em style="width:${Math.round(((r.played || 0) / max) * 100)}%"></em></i><small>${nf(r.n)}${r.played ? ` · ${nf(r.played)} ✓` : ''}</small></div>`).join('');
    };
    const maxDay = Math.max(1, ...days.map((d) => d.n));
    const chart = days.length ? `<div class="ra-days">${days.map((d) => `<div title="${d.d}: ${d.n} / ${d.played}"><i style="height:${Math.round((d.n / maxDay) * 100)}%"><b style="height:${d.n ? Math.round((d.played / d.n) * 100) : 0}%"></b></i><small>${d.d.slice(8)}</small></div>`).join('')}</div>` : `<p class="ra-note">${S.none}</p>`;
    const ago = (at) => {
      const m = Math.max(0, Math.round((Date.now() - at) / 60000));
      return m < 60 ? fill(S.ago.m, { n: m }) : m < 1440 ? fill(S.ago.h, { n: Math.round(m / 60) }) : fill(S.ago.d, { n: Math.round(m / 1440) });
    };
    const rec = recent.length ? recent.map((r) => `<div class="ra-row ${r.played ? 'yes' : ''}"><small>${ago(r.at)}</small><span>${esc(label(r.src ?? 'directo'))}</span><span>${esc(label(r.country ?? r.tz ?? '?'))}</span><span>${esc(label(r.device ?? '?'))}</span><b>${r.played ? '✓' : '·'}</b></div>`).join('') : `<p class="ra-note">${S.none}</p>`;
    const buys = purchases.length ? purchases.map((p) => `<div class="ra-row yes"><small>${ago(p.at)}</small><span>${esc(p.kind)}: ${esc(p.item)}</span><span>${p.usd != null ? `US$ ${Number(p.usd).toFixed(2)}` : ''}</span><span>${esc(p.method ?? '')}</span><b>✓</b></div>`).join('') : `<p class="ra-note">${S.none}</p>`;
    return `<div class="ra-card ra-stats" role="dialog" aria-modal="true">${head}
      <div class="ra-kpis">
        ${kpi(S.today, nf(today.n), `${nf(today.played)} ${S.played}`)}
        ${kpi(S.week, nf(sum(week, 'n')), `${nf(sum(week, 'played'))} ${S.played}`)}
        ${kpi(S.total, nf(tt?.players), `${nf(tt?.played)} ${S.played}`)}
        ${kpi(S.sales, nf(tt?.purchases), `US$ ${Number(tt?.usd ?? 0).toFixed(2)}`)}
      </div>
      <h3 class="ra-h3">${S.days}</h3>${chart}
      <h3 class="ra-h3">${S.sources}</h3>${bars(sources)}
      <h3 class="ra-h3">${S.places}</h3>${bars(countries)}
      <h3 class="ra-h3">${S.devices}</h3>${bars(devices)}
      <h3 class="ra-h3">${S.games}</h3>${bars(games)}
      <h3 class="ra-h3">${S.recent}</h3><div class="ra-rows">${rec}</div>
      <h3 class="ra-h3">${S.buys}</h3><div class="ra-rows">${buys}</div>
      <p class="ra-note ra-tip">${S.tip}</p></div>`;
  }

  function loadStats() {
    stats = null;
    statsErr = false;
    render();
    fetchStats()
      .then((d) => (stats = d))
      .catch(() => (statsErr = true))
      .finally(() => !root.hidden && view === 'stats' && render());
  }

  function render() {
    if (view === 'review' && account()?.player?.admin) {
      const L = tx();
      const R = REVIEW[lang()] ?? REVIEW.es;
      const itemName = (id) => {
        for (const [prefix, name] of [['liv-', R.paint], ['trail-', R.trail], ['ship-', R.ship]]) if (id.startsWith(prefix)) return `${name} ${id.slice(prefix.length)}`;
        return R[id] ?? id;
      };
      const options = ['pilot', 'gold', 'legend'].map((id) => `<option value="founder:${id}">${fill(L.founder, { tier: L.tiers[id] })}</option>`)
        .concat(Object.keys(STYLE_ITEMS).map((id) => `<option value="style:${id}">${esc(itemName(id))}</option>`)).join('');
      root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${R.title}">
        <header class="ra-head"><button class="ra-x" data-ra="statsBack" aria-label="${L.st.back}">${icon('back')}</button><h2>${R.title}</h2><button class="ra-x" data-ra="close" aria-label="close">${icon('x')}</button></header>
        <p class="ra-note">${R.sub}</p>
        <label class="ra-label" for="raReviewHash">${R.hash}</label><div class="ra-field"><input id="raReviewHash" maxlength="66" placeholder="0x…" autocomplete="off" /></div>
        <label class="ra-label" for="raReviewItem">${R.item}</label><div class="ra-field"><select id="raReviewItem">${options}</select></div>
        <label class="ra-label" for="raReviewAmount">${R.amount}</label><div class="ra-field"><input id="raReviewAmount" inputmode="decimal" placeholder="0.01" /></div>
        <label class="ra-label" for="raReviewReason">${R.reason}</label><div class="ra-field"><input id="raReviewReason" minlength="10" maxlength="300" /></div>
        <button class="ra-btn primary" data-ra="reviewSubmit" ${busy ? 'disabled' : ''}>${busy ? '…' : R.submit}</button></div>`;
      return;
    }
    if (view === 'stats' && account()?.player?.admin) {
      root.innerHTML = renderStats();
      return;
    }
    const L = tx();
    const a = account();
    const on = isOnline() && a;
    const guest = !a || a.player.guest;
    const founder = (a?.purchases ?? []).filter((p) => p.kind === 'founder').map((p) => p.item);
    const tier = ['legend', 'gold', 'pilot'].find((x) => founder.includes(x));
    const styles = (a?.purchases ?? []).filter((p) => p.kind === 'style').length;
    const btn = (act, ic, label, cls = 'ghost') => `<button class="ra-btn ${cls}" data-ra="${act}" ${busy ? 'disabled' : ''}>${icon(ic)}<span>${busy === act ? '…' : label}</span></button>`;
    const pk = passkeysSupported();
    const admin = !!a?.player?.admin;
    const tools = Object.keys(owner).filter((k) => typeof owner[k] === 'function');
    root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${L.title}">
      <header class="ra-head"><span class="ra-cube">${cube()}</span><div><h2>${L.title}</h2><p>${L.sub}</p></div>
        <button class="ra-x" data-ra="close" aria-label="close">${icon('x')}</button></header>
      ${!on ? `<div class="ra-status off">${icon('shield')}<div><b>${L.offline}</b></div><button class="ra-btn ghost sm" data-ra="retry">${L.retry}</button></div>` : `
      <div class="ra-status ${guest ? 'guest' : 'safe'}">${icon(guest ? 'user' : 'shield')}
        <div><b>${guest ? L.guest : L.safe}${admin ? ` <span class="ra-badge">${L.ownerBadge}</span>` : ''}</b><small>${guest ? L.guestHint : L.safeHint}</small></div></div>
      ${admin && tools.length ? `<section class="ra-owner"><h3 class="ra-h3">${icon('crown')}${L.owner}</h3><p class="ra-note">${L.ownerHint}</p>
        ${btn('stats', 'chart', L.st.open, 'primary')}
        ${btn('review', 'wallet', (REVIEW[lang()] ?? REVIEW.es).title)}
        ${fiatOn() ? btn('fiatOwner', 'wallet', fiatOwnerLabel(lang())) : ''}
        <div class="ra-tools">${tools.map((k) => btn(`owner:${k}`, 'star', L.tools[k] ?? k)).join('')}</div></section>` : ''}
      <label class="ra-label">${L.name}</label>
      <div class="ra-field"><input id="raName" maxlength="16" autocomplete="nickname" value="${esc(a.player.name)}" /><button class="ra-btn ghost sm" data-ra="name">${L.save}</button></div>
      <div class="ra-actions">
        ${pk ? btn('addPasskey', 'finger', a.passkeys.length ? L.addPasskeyMore : L.addPasskey, a.passkeys.length ? 'ghost' : 'primary') : ''}
        ${a.wallets.length ? '' : btn('wallet', 'wallet', L.wallet)}
      </div>
      ${a.wallets.length ? '' : `<p class="ra-note">${L.walletHint}</p>`}
      ${a.passkeys.length || a.wallets.length ? `<div class="ra-creds">
        ${a.passkeys.map((p) => `<span class="ra-cred">${icon('finger')}${esc(p.device)}</span>`).join('')}
        ${a.wallets.map((w) => `<span class="ra-cred">${icon('wallet')}${short(w)}</span>`).join('')}</div>` : ''}
      ${guest && pk ? `<div class="ra-login"><small>${L.loginTitle}</small>${btn('loginPasskey', 'finger', L.loginPasskey)}</div>` : ''}
      <h3 class="ra-h3">${L.games}</h3>
      <div class="ra-games">${games()}</div>
      ${tier || styles ? `<h3 class="ra-h3">${L.purchases}</h3><div class="ra-creds">
        ${tier ? `<span class="ra-cred gold">${icon('star')}${fill(L.founder, { tier: L.tiers[tier] })}</span>` : ''}
        ${styles ? `<span class="ra-cred">${icon('star')}${fill(L.styles, { n: styles })}</span>` : ''}</div>` : ''}
      <p class="ra-privacy">${L.privacy}</p>
      ${guest ? '' : `<button class="ra-link" data-ra="logout">${icon('out')}${L.logout}</button>`}`}
    </div>`;
  }

  function errText(err) {
    const L = tx();
    return L.err[err?.code] ?? fill(L.err.generic, { msg: String(err?.message ?? err).slice(0, 80) });
  }

  async function run(act, fn) {
    busy = act;
    render();
    try {
      await fn();
    } catch (err) {
      toast(errText(err), 'err');
    } finally {
      busy = null;
      if (!root.hidden) render();
    }
  }

  /** Después de entrar desde otro dispositivo: se recarga para traer el progreso de la cuenta. */
  function reloadSoon() {
    toast(tx().ok.login, 'ok');
    reloadForAccount();
  }

  root.addEventListener('click', (ev) => {
    if (ev.target === root) return close();
    const el = ev.target.closest('[data-ra]');
    if (!el || el.disabled) return;
    const act = el.dataset.ra;
    if (act === 'fiatOwner' && account()?.player?.admin) {
      const L = tx();
      return openFiatOwner({ itemName: (kind, item) => (kind === 'founder' ? fill(L.founder, { tier: L.tiers[item] ?? item }) : item) });
    }
    if (act === 'review' && account()?.player?.admin) {
      view = 'review';
      return render();
    }
    if (act === 'reviewSubmit' && account()?.player?.admin) {
      const R = REVIEW[lang()] ?? REVIEW.es;
      const amount = root.querySelector('#raReviewAmount')?.value.trim() ?? '';
      if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) return toast(R.error, 'err');
      const [whole, decimal = ''] = amount.split('.');
      const amountWei = (BigInt(whole) * 10n ** 18n + BigInt(decimal.padEnd(18, '0'))).toString();
      const [kind, item] = root.querySelector('#raReviewItem').value.split(':');
      const body = { tx: root.querySelector('#raReviewHash').value.trim(), kind, item, amountWei, reason: root.querySelector('#raReviewReason').value.trim() };
      return run(act, async () => {
        try {
          const { id, message } = await api('POST', '/api/rift/purchase/review/options', body);
          const provider = await walletProvider();
          if (!provider) throw new Error('noWallet');
          const [address] = await provider.request({ method: 'eth_requestAccounts' });
          const hex = [...new TextEncoder().encode(message)].map((x) => x.toString(16).padStart(2, '0')).join('');
          const signature = await provider.request({ method: 'personal_sign', params: [`0x${hex}`, address] });
          await api('POST', '/api/rift/purchase/review', { id, signature });
          toast(R.done, 'ok');
          view = 'main';
        } catch (err) {
          toast(err?.code === 4001 ? tx().err.rejected : R.error, 'err');
        }
      });
    }
    if (act === 'stats' || act === 'statsLoad') {
      view = 'stats';
      return loadStats();
    }
    if (act === 'statsBack') {
      view = 'main';
      return render();
    }
    if (act === 'close') {
      ev.preventDefault();
      return close();
    }
    if (act.startsWith('owner:')) {
      const fn = owner[act.slice(6)];
      if (!account()?.player?.admin || typeof fn !== 'function') return;
      return run(act, async () => {
        await fn();
        toast(tx().ownerDone, 'ok');
        onChange();
      });
    }
    if (act === 'retry') return run(act, async () => {
      await start();
    });
    if (act === 'name') {
      // Se lee antes de redibujar: al redibujar, el campo vuelve al nombre guardado.
      const v = root.querySelector('#raName')?.value ?? '';
      return run(act, () => saveName(v));
    }
    if (act === 'addPasskey') return run(act, async () => {
      await addPasskey();
      toast(tx().ok.passkey, 'ok');
    });
    if (act === 'loginPasskey') return run(act, async () => {
      const r = await loginPasskey();
      if (r.switched) reloadSoon();
    });
    // Sin wallet en el navegador y sin WalletConnect: abrir el juego dentro de MetaMask (celular) o
    // instalar la extensión (compu). Con WalletConnect se conecta la wallet desde acá.
    if (act === 'wallet' && !injected() && !remoteWallet()) return openInMetaMask(walletLink, { lang: lang() });
    if (act === 'wallet') return run(act, async () => {
      const r = await loginWallet().catch((err) => {
        // Si la conexión con la app falla, queda la otra forma: abrir el juego dentro de MetaMask.
        if (err?.code === 'mmconnect') openInMetaMask(walletLink, { lang: lang() });
        throw err;
      });
      if (r.switched) return reloadSoon();
      toast(tx().ok.wallet, 'ok');
      // Las compras hechas con esa wallet en este dispositivo pasan a la cuenta, y el juego se entera
      // de la wallet (por ejemplo, el Hangar usa la misma conexión).
      await syncPurchases();
      onChange();
    });
    if (act === 'logout') {
      if (!confirm(tx().logoutConfirm)) return;
      return run(act, async () => {
        await logout();
        reloadForAccount(0);
      });
    }
  });

  async function saveName(v) {
    await setName(v);
    try {
      localStorage.setItem('riftfall.name', account()?.player?.name ?? v);
    } catch {
      /* sin almacenamiento */
    }
    toast(tx().ok.name, 'ok');
  }

  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
    if (ev.key === 'Enter' && ev.target.id === 'raName') root.querySelector('[data-ra="name"]')?.click();
  });
  onAccount(() => {
    if (!root.hidden && !busy) render();
  });

  /** `owner: true` abre directo en el Panel del dueño (si la cuenta es del dueño). */
  function open({ owner: toOwner = false } = {}) {
    view = 'main';
    render();
    root.hidden = false;
    root.querySelector('.ra-x')?.focus();
    const section = toOwner && root.querySelector('.ra-owner');
    if (section) {
      section.scrollIntoView({ block: 'start' });
      section.classList.add('flash');
      setTimeout(() => section.classList.remove('flash'), 1200);
    }
  }
  function close() {
    root.hidden = true;
  }

  return {
    open,
    close,
    /** Texto corto para un botón o aviso: "Proteger tu progreso". */
    nudgeText: () => ({ title: tx().nudge, sub: tx().nudgeSub }),
    /** ¿Conviene sugerir proteger la cuenta? (invitado con servidor y con algo que perder) */
    shouldNudge: () => isOnline() && !!account()?.player?.guest
  };
}

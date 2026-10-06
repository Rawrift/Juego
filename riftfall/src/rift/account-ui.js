// Ventana "Cuenta Rift", la misma en RIFTFALL y en Rift Cargo: estado de la cuenta, nombre, proteger
// con huella / Face ID, entrar desde otro dispositivo, wallet, los dos juegos del universo y las compras.

import './account.css';
import {
  account, isOnline, start, loginWallet, addPasskey, loginPasskey, setName, logout, passkeysSupported, onAccount, syncPurchases, reloadForAccount
} from './account.js';

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
      expired: 'Se venció el pedido. Probá de nuevo.',
      offline: 'Sin conexión con el servidor.',
      generic: 'No se pudo completar: {msg}'
    },
    nudge: 'Protegé tu progreso',
    nudgeSub: 'Huella o Face ID, sin contraseñas'
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
      expired: 'The request expired. Try again.',
      offline: 'No connection to the server.',
      generic: 'Could not complete it: {msg}'
    },
    nudge: 'Secure your progress',
    nudgeSub: 'Fingerprint or Face ID, no passwords'
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
      expired: 'O pedido expirou. Tente de novo.',
      offline: 'Sem conexão com o servidor.',
      generic: 'Não foi possível concluir: {msg}'
    },
    nudge: 'Proteja seu progresso',
    nudgeSub: 'Digital ou Face ID, sem senhas'
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
 * `toast(texto, tipo)` muestra avisos con el estilo del juego.
 */
export function createAccountUI({ game, lang = () => 'es', toast = () => {}, onChange = () => {} }) {
  const root = document.createElement('div');
  root.className = 'ra-overlay';
  root.hidden = true;
  document.body.appendChild(root);
  let busy = null;
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

  function render() {
    const L = tx();
    const a = account();
    const on = isOnline() && a;
    const guest = !a || a.player.guest;
    const founder = (a?.purchases ?? []).filter((p) => p.kind === 'founder').map((p) => p.item);
    const tier = ['legend', 'gold', 'pilot'].find((x) => founder.includes(x));
    const styles = (a?.purchases ?? []).filter((p) => p.kind === 'style').length;
    const btn = (act, ic, label, cls = 'ghost') => `<button class="ra-btn ${cls}" data-ra="${act}" ${busy ? 'disabled' : ''}>${icon(ic)}<span>${busy === act ? '…' : label}</span></button>`;
    const pk = passkeysSupported();
    root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${L.title}">
      <header class="ra-head"><span class="ra-cube">${cube()}</span><div><h2>${L.title}</h2><p>${L.sub}</p></div>
        <button class="ra-x" data-ra="close" aria-label="close">${icon('x')}</button></header>
      ${!on ? `<div class="ra-status off">${icon('shield')}<div><b>${L.offline}</b></div><button class="ra-btn ghost sm" data-ra="retry">${L.retry}</button></div>` : `
      <div class="ra-status ${guest ? 'guest' : 'safe'}">${icon(guest ? 'user' : 'shield')}
        <div><b>${guest ? L.guest : L.safe}</b><small>${guest ? L.guestHint : L.safeHint}</small></div></div>
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
    if (act === 'close') {
      ev.preventDefault();
      return close();
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
    if (act === 'wallet') return run(act, async () => {
      const r = await loginWallet();
      if (r.switched) return reloadSoon();
      toast(tx().ok.wallet, 'ok');
      // Las compras hechas con esa wallet en este dispositivo pasan a la cuenta.
      if (await syncPurchases()) onChange();
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

  function open() {
    render();
    root.hidden = false;
    root.querySelector('.ra-x')?.focus();
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

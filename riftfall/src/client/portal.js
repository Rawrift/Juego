// Versión para portales de juegos web (CrazyGames): sin funciones cripto y con los anuncios del
// portal (entre partidas y recompensados, siempre opcionales). Se compila con `npm run build:portal`.

export const PORTAL = import.meta.env.MODE === 'portal';
// En el Basic Launch de CrazyGames no se permiten anuncios: se activan con VITE_PORTAL_ADS=1 para el Full Launch.
const ADS = import.meta.env.VITE_PORTAL_ADS === '1';
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
// Portales sin SDK (itch.io, Newgrounds…): VITE_PORTAL_SDK=none. El juego queda igual, sin anuncios.
const USE_SDK = import.meta.env.VITE_PORTAL_SDK !== 'none';

let sdk = null;

/** Carga e inicia el SDK del portal. Sin SDK (o bloqueado) el juego funciona igual, sin anuncios. */
export async function initPortal() {
  if (!PORTAL) return;
  document.documentElement.classList.add('portal');
  if (!USE_SDK) return;
  await new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = resolve;
    s.onerror = resolve;
    document.head.append(s);
  });
  try {
    await window.CrazyGames?.SDK?.init();
    sdk = window.CrazyGames?.SDK ?? null;
  } catch {
    sdk = null;
  }
  if (sdk?.data) await syncProgress(sdk.data);
}

// Progreso en la cuenta del portal (Data Module de CrazyGames): el jugador lo recupera en cualquier
// dispositivo. El juego sigue leyendo y escribiendo localStorage; acá se trae la copia del portal al
// arrancar y se le reenvía cada cambio. Las preferencias del dispositivo (idioma, sonido, gráficos) no viajan.
const SYNCED = ['riftfall.progress', 'riftfall.tutorial', 'riftfall.rift'];

async function syncProgress(data) {
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  for (const key of SYNCED) {
    try {
      const v = await data.getItem(key);
      if (typeof v === 'string') setItem.call(localStorage, key, v);
    } catch {
      /* sin copia en el portal: queda la local */
    }
  }
  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (this === localStorage && SYNCED.includes(key)) call(() => data.setItem(key, String(value)));
  };
  Storage.prototype.removeItem = function (key) {
    removeItem.call(this, key);
    if (this === localStorage && SYNCED.includes(key)) call(() => data.removeItem(key));
  };
}

const call = (fn) => {
  try {
    fn();
  } catch {
    /* el portal nunca debe romper el juego */
  }
};

export const portal = {
  get active() {
    return !!sdk;
  },
  /** Hay anuncios: revivir, x2 Núcleos y el anuncio entre partidas. */
  get ads() {
    return !!sdk && ADS;
  },
  loadingStart: () => call(() => sdk?.game.loadingStart()),
  loadingStop: () => call(() => sdk?.game.loadingStop()),
  gameplayStart: () => call(() => sdk?.game.gameplayStart()),
  gameplayStop: () => call(() => sdk?.game.gameplayStop()),
  happytime: () => call(() => sdk?.game.happytime()),
  /** Avisa cuándo el portal pide silenciar el juego (su ajuste manda sobre el del juego). */
  onMute(fn) {
    if (!sdk?.game) return;
    call(() => fn(!!sdk.game.settings?.muteAudio));
    call(() => sdk.game.addSettingsChangeListener((settings) => fn(!!settings?.muteAudio)));
  },
  /**
   * Muestra un anuncio ('midgame' | 'rewarded'). `onStart` y `onEnd` pausan y reanudan el
   * sonido. Resuelve true solo si el anuncio se vio completo (la recompensa se da solo así).
   */
  ad(type, { onStart = () => {}, onEnd = () => {} } = {}) {
    if (!sdk || !ADS) return Promise.resolve(false);
    return new Promise((resolve) => {
      let started = false;
      const done = (ok) => {
        if (started) onEnd();
        resolve(ok);
      };
      call(() =>
        sdk.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            onStart();
          },
          adFinished: () => done(true),
          adError: () => done(false)
        })
      );
    });
  }
};

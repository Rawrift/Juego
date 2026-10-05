// Cliente de la API del servidor. Guarda el token de sesión en localStorage.

const TOKEN_KEY = 'riftfall.token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* modo privado */
  }
}

export function createApi(base = '') {
  let token = readToken();

  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (!res.ok) {
      const err = new Error(json.error || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  return {
    get token() {
      return token;
    },
    setToken(t) {
      token = t;
      writeToken(t);
    },
    async session() {
      if (token) {
        try {
          return (await call('GET', '/api/profile')).profile;
        } catch (err) {
          if (err.status !== 401) throw err;
        }
      }
      const g = await call('POST', '/api/auth/guest');
      this.setToken(g.token);
      return g.profile;
    },
    config: () => call('GET', '/api/config'),
    profile: async () => (await call('GET', '/api/profile')).profile,
    setName: async (name) => (await call('POST', '/api/profile/name', { name })).profile,
    nonce: (address) => call('POST', '/api/auth/nonce', { address }),
    async loginWallet(address, signature) {
      const r = await call('POST', '/api/auth/wallet', { address, signature });
      this.setToken(r.token);
      return r.profile;
    },
    ships: async () => (await call('GET', '/api/ships')).ships,
    startRun: (body) => call('POST', '/api/run/start', body),
    finishRun: (body) => call('POST', '/api/run/finish', body),
    leaderboard: (scope) => call('GET', `/api/leaderboard?scope=${scope}`),
    claim: (shards) => call('POST', '/api/claim', { shards }),
    economy: () => call('GET', '/api/economy'),
    arena: () => call('GET', '/api/arena'),
    arenaStatus: () => call('GET', '/api/arena/status')
  };
}

// Lanzador: crea el token y todos los contratos de RIFTFALL desde la wallet del creador.
// Pensado para el celular: se abre desde el navegador de MetaMask, Trust Wallet o Binance Web3 Wallet.
// El progreso se guarda tras cada transacción, así que si la app se cierra se continúa donde quedó.

import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/700.css';
import '../client/styles.css';
import './launcher.css';

import { BrowserProvider, ContractFactory, Contract, formatEther, parseEther, getAddress } from 'ethers';
import generated from '../generated/contracts.json';
import { $, el, toast, shortAddr } from '../client/dom.js';

const { contracts: C, deploy: D } = generated;
const SUPPLY = 1_000_000_000n;
const GAS_TOTAL = 10_500_000n; // medido desplegando todo en una red local
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);

const NETWORKS = [
  {
    id: 97,
    key: 'bscTestnet',
    label: 'BNB Chain Testnet',
    hint: 'Pruebas: usa tBNB sin valor. Ideal para probar primero.',
    symbol: 'tBNB',
    explorer: 'https://testnet.bscscan.com',
    params: {
      chainId: '0x61',
      chainName: 'BNB Smart Chain Testnet',
      nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
      rpcUrls: ['https://bsc-testnet-rpc.publicnode.com'],
      blockExplorerUrls: ['https://testnet.bscscan.com']
    }
  },
  {
    id: 56,
    key: 'bsc',
    label: 'BNB Chain (real)',
    hint: 'Red real. Crear todo cuesta menos de un dólar en BNB.',
    symbol: 'BNB',
    explorer: 'https://bscscan.com',
    params: {
      chainId: '0x38',
      chainName: 'BNB Smart Chain',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
      blockExplorerUrls: ['https://bscscan.com']
    }
  }
];
if (isLocalHost) {
  NETWORKS.push({
    id: 31337,
    key: 'localhost',
    label: 'Red local (Hardhat)',
    hint: 'Solo para desarrollo en tu computadora.',
    symbol: 'ETH',
    explorer: '',
    params: {
      chainId: '0x7a69',
      chainName: 'RIFTFALL Local',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['http://127.0.0.1:8545']
    }
  });
}

const STEPS = [
  { id: 'RiftToken', label: 'Crear el token' },
  { id: 'RewardVault', label: 'Crear el pool de recompensas' },
  { id: 'RiftShips', label: 'Crear las naves NFT' },
  { id: 'RiftMarket', label: 'Crear el mercado' },
  { id: 'RiftArena', label: 'Crear la arena de torneos' },
  { id: 'TeamVesting', label: 'Crear tu bóveda con vesting' },
  { id: 'fundVault', label: 'Cargar el 40% en el pool de jugadores' },
  { id: 'fundVesting', label: 'Bloquear tu 15% en el vesting' }
];

const ui = { provider: null, signer: null, account: null, chainId: null, network: NETWORKS[0], busy: false, failed: null };

// ------------------------------------------------------------------ estado persistente

const stateKey = () => `riftfall.launch.${ui.network.id}.${ui.account?.toLowerCase()}`;
function loadState() {
  try {
    return JSON.parse(localStorage.getItem(stateKey()) ?? 'null');
  } catch {
    return null;
  }
}
function saveState(st) {
  try {
    localStorage.setItem(stateKey(), JSON.stringify(st));
  } catch {
    /* sin almacenamiento: el lanzamiento sigue, pero no se podrá reanudar */
  }
}

function explain(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 || err?.info?.error?.code === 4001) return 'Cancelaste la operación en la wallet.';
  if (err?.code === 'INSUFFICIENT_FUNDS') return `No hay suficiente ${ui.network.symbol} para pagar el gas.`;
  return String(err?.shortMessage || err?.reason || err?.message || err).slice(0, 200);
}

// ------------------------------------------------------------------ paso 1: wallet

function renderWallet() {
  const body = $('#walletBody');
  if (!window.ethereum) {
    const url = location.href;
    body.replaceChildren(
      el('p', {}, 'Abre esta página desde el navegador de tu wallet para poder firmar:'),
      el('div', { class: 'lx-actions' }, [
        el('a', { class: 'btn primary', href: `https://metamask.app.link/dapp/${location.host}${location.pathname}` }, 'Abrir en MetaMask'),
        el('a', { class: 'btn secondary', href: `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}` }, 'Abrir en Trust Wallet')
      ]),
      el('p', { class: 'lx-note' }, 'Binance Web3 Wallet: en la app de Binance entra a Wallet → Web3 → Descubrir, y pega esta dirección:'),
      el('div', { class: 'lx-actions' }, [
        el('span', { class: 'lx-mono' }, url),
        el('button', { class: 'btn ghost small', onclick: () => copy(url) }, 'Copiar dirección')
      ])
    );
    return;
  }
  if (!ui.account) {
    body.replaceChildren(el('button', { class: 'btn primary big', onclick: connect }, 'Conectar wallet'));
    return;
  }
  body.replaceChildren(
    el('div', { class: 'lx-cost' }, [
      stat('CUENTA', shortAddr(ui.account)),
      stat('RED ACTUAL', ui.chainId === ui.network.id ? ui.network.label : `chainId ${ui.chainId}`)
    ])
  );
}

async function connect() {
  try {
    ui.provider = new BrowserProvider(window.ethereum, 'any');
    await ui.provider.send('eth_requestAccounts', []);
    ui.signer = await ui.provider.getSigner();
    ui.account = await ui.signer.getAddress();
    ui.chainId = Number((await ui.provider.getNetwork()).chainId);
    window.ethereum.on?.('accountsChanged', () => location.reload());
    window.ethereum.on?.('chainChanged', () => location.reload());
    const match = NETWORKS.find((n) => n.id === ui.chainId);
    if (match) ui.network = match;
    await refresh();
  } catch (err) {
    toast(explain(err), 'err');
  }
}

async function switchNetwork() {
  if (ui.chainId === ui.network.id) return;
  try {
    await ui.provider.send('wallet_switchEthereumChain', [{ chainId: ui.network.params.chainId }]);
  } catch (err) {
    const code = err?.error?.code ?? err?.code ?? err?.info?.error?.code;
    if (code === 4902 || code === -32603) await ui.provider.send('wallet_addEthereumChain', [ui.network.params]);
    else throw err;
  }
  ui.provider = new BrowserProvider(window.ethereum, 'any');
  ui.signer = await ui.provider.getSigner();
  ui.chainId = Number((await ui.provider.getNetwork()).chainId);
}

// ------------------------------------------------------------------ paso 2: red

function renderNetworks() {
  $('#networkList').replaceChildren(
    ...NETWORKS.map((n) => {
      const input = el('input', { type: 'radio', name: 'net', value: n.id, checked: n.id === ui.network.id });
      const opt = el('label', { class: `lx-option${n.id === ui.network.id ? ' on' : ''}`, 'data-chain': n.id }, [
        input,
        el('b', {}, n.label),
        el('small', {}, n.hint)
      ]);
      input.addEventListener('change', async () => {
        ui.network = n;
        await refresh();
      });
      return opt;
    })
  );
  $('#networkNote').textContent =
    ui.network.id === 97
      ? 'Para conseguir tBNB gratis usa el faucet oficial de BNB Chain (bnbchain.org/en/testnet-faucet).'
      : ui.network.id === 56
        ? 'Necesitas un poco de BNB en tu wallet para el gas (unos 0,001 BNB alcanzan con margen). Puedes retirarlo desde Binance por la red BSC (BEP20).'
        : '';
}

// ------------------------------------------------------------------ paso 4: costo y lanzamiento

async function renderCost() {
  const box = $('#costBox');
  const btn = $('#launchBtn');
  if (!ui.account) {
    box.replaceChildren(el('p', { class: 'lx-note' }, 'Conecta tu wallet para calcular el costo.'));
    btn.disabled = true;
    return;
  }
  const st = loadState();
  btn.textContent = st && !st.complete ? 'Continuar el lanzamiento' : st?.complete ? 'Ya lanzado en esta red' : 'Crear mi token y el juego';
  btn.disabled = !!st?.complete || ui.busy;
  if (ui.chainId !== ui.network.id) {
    box.replaceChildren(el('p', { class: 'lx-note' }, `Al tocar el botón, tu wallet cambiará a ${ui.network.label}.`));
    return;
  }
  try {
    const [fee, balance] = await Promise.all([ui.provider.getFeeData(), ui.provider.getBalance(ui.account)]);
    const gasPrice = fee.gasPrice ?? 1_000_000_000n;
    const cost = GAS_TOTAL * gasPrice;
    const enough = balance >= (cost * 13n) / 10n;
    const nodes = [
      stat('COSTO ESTIMADO', `${trim(formatEther(cost))} ${ui.network.symbol}`),
      stat('TU SALDO', `${trim(formatEther(balance))} ${ui.network.symbol}`)
    ];
    if (!enough) {
      nodes.push(el('p', { class: 'notice', style: 'grid-column:1/-1' }, `Saldo insuficiente: necesitas al menos ${trim(formatEther((cost * 13n) / 10n))} ${ui.network.symbol}.`));
    }
    box.replaceChildren(...nodes);
  } catch {
    box.replaceChildren(el('p', { class: 'lx-note' }, 'No se pudo consultar el costo ahora.'));
  }
}

function renderProgress(st, running = null, failed = null) {
  $('#progress').replaceChildren(
    ...STEPS.map((s) => {
      const done = st?.done?.[s.id];
      const cls = done ? 'ok' : s.id === running ? 'run' : s.id === failed ? 'err' : '';
      return el('li', { class: cls }, s.label);
    })
  );
}

async function launch() {
  if (ui.busy) return;
  const name = $('#tokenName').value.trim();
  const symbol = $('#tokenSymbol').value.trim().toUpperCase();
  let st = loadState();
  if (!st) {
    if (!/^[\p{L}\p{N} ._-]{3,32}$/u.test(name)) return toast('Nombre: de 3 a 32 letras o números.', 'err');
    if (!/^[A-Z0-9]{2,8}$/.test(symbol)) return toast('Símbolo: de 2 a 8 letras mayúsculas o números.', 'err');
  }
  ui.busy = true;
  ui.failed = null;
  $('#launchBtn').disabled = true;
  let current = null;
  try {
    await switchNetwork();
    st = loadState() ?? { name, symbol, owner: ui.account, chainId: ui.network.id, done: {}, pending: {}, addresses: {} };
    saveState(st);
    const owner = ui.account;
    const unit = (n) => parseEther(String(n));
    const classes = D.shipClasses.map((c) => ({
      name: c.name,
      color: c.color,
      priceWei: parseEther(D.bnbChains.includes(ui.network.id) ? c.priceBnb : c.priceEth),
      priceRift: unit(c.priceRift),
      maxSupply: c.maxSupply
    }));
    const A = st.addresses;

    const deployStep = async (id, args) => {
      if (st.done[id]) return;
      current = id;
      renderProgress(st, id);
      let address = null;
      if (st.pending[id]) {
        const rc = await ui.provider.waitForTransaction(st.pending[id]);
        address = rc?.contractAddress ?? null;
      }
      if (!address) {
        const factory = new ContractFactory(C[id].abi, C[id].bytecode, ui.signer);
        const contract = await factory.deploy(...args);
        st.pending[id] = contract.deploymentTransaction().hash;
        saveState(st);
        await contract.waitForDeployment();
        address = await contract.getAddress();
      }
      A[id] = getAddress(address);
      st.done[id] = true;
      delete st.pending[id];
      saveState(st);
    };

    const transferStep = async (id, to, percent) => {
      if (st.done[id]) return;
      current = id;
      renderProgress(st, id);
      if (st.pending[id]) {
        await ui.provider.waitForTransaction(st.pending[id]);
      } else {
        const token = new Contract(A.RiftToken, C.RiftToken.abi, ui.signer);
        const tx = await token.transfer(to, (SUPPLY * BigInt(percent) * 10n ** 18n) / 100n);
        st.pending[id] = tx.hash;
        saveState(st);
        await tx.wait();
      }
      st.done[id] = true;
      delete st.pending[id];
      saveState(st);
    };

    const d = D.defaults;
    await deployStep('RiftToken', [st.name, st.symbol, owner]);
    await deployStep('RewardVault', [A.RiftToken, owner, owner, unit(d.dailyEmission), unit(d.maxClaimPerPlayerPerDay)]);
    await deployStep('RiftShips', [A.RiftToken, A.RewardVault, owner, owner, unit(d.forgeBaseCost), classes]);
    await deployStep('RiftMarket', [A.RiftShips, A.RiftToken, owner, owner, Number(d.marketFeeBps)]);
    await deployStep('RiftArena', [A.RiftToken, A.RewardVault, owner, owner, owner]);
    if (!st.done.TeamVesting && !st.vestingStart) {
      st.vestingStart = (await ui.provider.getBlock('latest')).timestamp;
      saveState(st);
    }
    await deployStep('TeamVesting', [owner, st.vestingStart, BigInt(d.vestingSeconds), BigInt(d.cliffSeconds)]);
    await transferStep('fundVault', A.RewardVault, D.allocation.rewards);
    await transferStep('fundVesting', A.TeamVesting, D.allocation.team);
    st.complete = true;
    st.completedAt = new Date().toISOString();
    saveState(st);
    renderProgress(st);
    toast('¡Tu token y tu juego ya están en la blockchain!', 'ok');
  } catch (err) {
    ui.failed = current;
    toast(explain(err), 'err');
  } finally {
    ui.busy = false;
    await refresh();
  }
}

// ------------------------------------------------------------------ resultado y administración

function deploymentJson(st) {
  return {
    chainId: ui.network.id,
    network: ui.network.key,
    deployedAt: st.completedAt,
    token: { name: st.name, symbol: st.symbol },
    contracts: {
      RiftToken: st.addresses.RiftToken,
      RewardVault: st.addresses.RewardVault,
      RiftShips: st.addresses.RiftShips,
      RiftMarket: st.addresses.RiftMarket,
      RiftArena: st.addresses.RiftArena,
      TeamVesting: st.addresses.TeamVesting
    },
    roles: { owner: st.owner, treasury: st.owner, signer: st.owner, operator: st.owner }
  };
}

function renderDone(st) {
  const show = !!st?.complete;
  $('#stepDone').classList.toggle('hidden', !show);
  $('#stepAdmin').classList.toggle('hidden', !show);
  if (!show) return;
  const dep = deploymentJson(st);
  const json = JSON.stringify(dep, null, 2);
  const link = (addr) =>
    ui.network.explorer ? el('a', { href: `${ui.network.explorer}/address/${addr}`, target: '_blank', rel: 'noopener' }, shortAddr(addr)) : el('span', { class: 'lx-mono' }, shortAddr(addr));
  const labels = { RiftToken: `Token ${st.symbol}`, RewardVault: 'Pool de recompensas', RiftShips: 'Naves NFT', RiftMarket: 'Mercado', RiftArena: 'Arena', TeamVesting: 'Tu vesting' };
  $('#doneBody').replaceChildren(
    el('p', {}, `${st.name} (${st.symbol}) quedó creado en ${ui.network.label}. Eres el dueño de todos los contratos y la tesorería es tu wallet.`),
    el('div', { class: 'notice' }, [
      el('b', {}, 'Último paso: '),
      'toca "Copiar configuración" y pégala en el chat con Claude. Con eso se conecta tu token al juego y se activa la tienda de naves.'
    ]),
    el('div', { class: 'lx-actions' }, [
      el('button', { class: 'btn gold big', id: 'copyConfig', onclick: () => copy(json) }, 'Copiar configuración'),
      el('button', { class: 'btn primary', onclick: () => watchToken(st) }, `Agregar ${st.symbol} a mi wallet`)
    ]),
    el('div', { class: 'lx-addr' }, Object.entries(dep.contracts).map(([k, v]) => el('div', {}, [el('span', {}, labels[k]), link(v)]))),
    el('div', { class: 'lx-actions' }, [
      el('a', { class: 'btn ghost', href: '/' }, 'Abrir el juego'),
      el('button', { class: 'btn ghost', onclick: () => download(`deployment-${ui.network.id}.json`, json) }, 'Descargar configuración')
    ]),
    el('details', {}, [el('summary', { class: 'lx-note' }, 'Ver configuración'), el('pre', { class: 'lx-mono' }, json)]),
    el('h3', {}, 'Después'),
    el('ol', { class: 'lx-steps' }, [
      el('li', {}, 'Cada venta de naves se acumula en el contrato: cóbrala con el botón de Administración (abajo).'),
      el('li', {}, 'Cuando el servidor de recompensas esté publicado, registra su dirección como firmante (abajo) para que los jugadores puedan canjear.')
    ])
  );
  renderAdmin(st);
}

async function renderAdmin(st) {
  const A = st.addresses;
  const ships = new Contract(A.RiftShips, C.RiftShips.abi, ui.signer);
  const vault = new Contract(A.RewardVault, C.RewardVault.abi, ui.signer);
  const arena = new Contract(A.RiftArena, C.RiftArena.abi, ui.signer);
  let pending = 0n;
  let signer = '';
  try {
    [pending, signer] = await Promise.all([ui.provider.getBalance(A.RiftShips), vault.signer()]);
  } catch {
    /* red no disponible */
  }
  const withdrawBtn = el('button', { class: 'btn gold', disabled: pending === 0n }, `Cobrar ${trim(formatEther(pending))} ${ui.network.symbol} de ventas`);
  withdrawBtn.addEventListener('click', () => run(withdrawBtn, async () => (await ships.withdraw()).wait(), 'Ventas cobradas a tu wallet'));
  const signerIn = el('input', { placeholder: '0x… dirección del servidor', autocomplete: 'off' });
  const signerBtn = el('button', { class: 'btn ghost' }, 'Cambiar firmante');
  signerBtn.addEventListener('click', () =>
    run(signerBtn, async () => {
      const addr = getAddress(signerIn.value.trim());
      await (await vault.setSigner(addr)).wait();
      await (await arena.setOperator(addr)).wait();
    }, 'Firmante del servidor actualizado')
  );
  $('#adminBody').replaceChildren(
    el('p', { class: 'lx-note' }, 'Las ventas de naves se acumulan en el contrato. Este botón las envía a tu wallet (tesorería).'),
    withdrawBtn,
    el('p', { class: 'lx-note' }, `Firmante actual de recompensas y operador de Arena: ${shortAddr(signer)}. Cámbialo por la dirección del servidor cuando lo publiques.`),
    el('label', { class: 'lx-field' }, ['DIRECCIÓN DEL SERVIDOR', signerIn]),
    signerBtn
  );
}

async function run(btn, fn, ok) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Confirmando…';
  try {
    await fn();
    toast(ok, 'ok');
    await refresh();
  } catch (err) {
    toast(explain(err), 'err');
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function watchToken(st) {
  try {
    await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: { type: 'ERC20', options: { address: st.addresses.RiftToken, symbol: st.symbol, decimals: 18 } }
    });
  } catch (err) {
    toast(explain(err), 'err');
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado', 'ok');
  } catch {
    toast('No se pudo copiar automáticamente: mantén pulsado el texto para copiarlo.', 'err');
  }
}

function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

function stat(label, value) {
  return el('div', { class: 'stat' }, [el('small', {}, label), el('b', {}, value)]);
}

function trim(v) {
  const n = Number(v);
  return n === 0 ? '0' : n < 0.0001 ? n.toExponential(2) : n.toLocaleString('es', { maximumFractionDigits: 6 });
}

// ------------------------------------------------------------------ arranque

async function refresh() {
  renderWallet();
  renderNetworks();
  const st = ui.account ? loadState() : null;
  if (st) {
    $('#tokenName').value = st.name;
    $('#tokenSymbol').value = st.symbol;
  }
  $('#tokenName').disabled = $('#tokenSymbol').disabled = !!st;
  renderProgress(st, null, ui.failed);
  await renderCost();
  if (st?.complete && ui.chainId === ui.network.id) renderDone(st);
  else renderDone(null);
}

$('#launchBtn').addEventListener('click', launch);
$('#tokenSymbol').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

(async () => {
  await refresh();
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts?.length) await connect();
    } catch {
      /* el usuario conectará manualmente */
    }
  }
})();

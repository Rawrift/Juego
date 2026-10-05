import { formatEther } from 'ethers';

export const $ = (sel) => document.querySelector(sel);

/** Crea un elemento: el('div', { class: 'x', onclick: fn }, [hijos | texto]) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(msg, kind = '') {
  const t = el('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 4000);
}

export function fmtTime(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtNum(n) {
  return Number(n).toLocaleString('es');
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

export function fmtRift(wei, digits = 2) {
  const v = Number(formatEther(wei));
  return v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 4 : digits });
}

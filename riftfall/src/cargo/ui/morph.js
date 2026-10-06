// Actualiza un elemento con HTML nuevo tocando solo lo que cambió (los botones no se reemplazan:
// así no se pierden clics ni el estado de "hover" cuando el panel se refresca seguido).

function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
    a.replaceWith(b);
    return;
  }
  if (a.nodeType === Node.TEXT_NODE || a.nodeType === Node.COMMENT_NODE) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && name !== 'class') a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) {
    if (name === 'class') continue;
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
  // Las clases que agrega el tutorial (glow-target) se respetan.
  const keep = a.classList?.contains('glow-target');
  const cls = b.getAttribute('class') ?? '';
  if ((a.getAttribute('class') ?? '') !== cls) a.setAttribute('class', cls);
  if (keep) a.classList.add('glow-target');
  morphChildren(a, b);
  if (a.tagName === 'SELECT') {
    const sel = b.querySelector('option[selected]');
    if (sel && a.value !== sel.value) a.value = sel.value;
  }
}

function morphChildren(a, b) {
  const ac = [...a.childNodes];
  const bc = [...b.childNodes];
  for (let i = 0; i < bc.length; i++) {
    if (i < ac.length) morphNode(ac[i], bc[i]);
    else a.appendChild(bc[i]);
  }
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}

export function morph(el, html) {
  const tmp = document.createElement(el.tagName);
  tmp.innerHTML = html;
  morphChildren(el, tmp);
}

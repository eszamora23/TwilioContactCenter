// Small, cached script loader for on-demand SDKs
const _loaded = new Map();

export async function loadScriptOnce(src, { crossorigin } = {}) {
  if (_loaded.has(src)) return _loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (crossorigin) s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  _loaded.set(src, p);
  return p;
}

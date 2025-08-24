export const byId = (id) => document.getElementById(id);
export const qs   = (sel) => document.querySelector(sel);
export const qsa  = (sel) => document.querySelectorAll(sel);

export function show(el){ el && el.classList.remove('hidden'); }
export function hide(el){ el && el.classList.add('hidden'); }

export function scrollToBottom(ul){
  try { ul?.lastElementChild?.scrollIntoView({ behavior:'smooth' }); } catch {}
}

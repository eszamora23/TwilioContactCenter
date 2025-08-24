class Bus extends EventTarget {
  emit(type, detail){ this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, cb){ this.addEventListener(type, (e)=>cb(e.detail)); }
  off(type, cb){ this.removeEventListener(type, cb); }
}
export const bus = new Bus();

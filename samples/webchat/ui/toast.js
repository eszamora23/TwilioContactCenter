export function toast(text){
  let node = document.getElementById('toast');
  if(!node){
    node = document.createElement('div');
    node.id='toast';
    node.style.position='fixed';
    node.style.bottom='calc(var(--bottombar-h) + var(--safe-bottom) + 16px)';
    node.style.right='max(16px, calc(16px + var(--safe-right)))';
    node.style.padding='12px 16px';
    node.style.border='1px solid var(--stroke)';
    node.style.borderRadius='12px';
    node.style.background='var(--card)';
    node.style.color='var(--text)';
    node.style.boxShadow='var(--shadow)';
    node.style.zIndex='9999';
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.style.opacity = '1';
  setTimeout(()=>{ node.style.transition='opacity .5s'; node.style.opacity='0'; }, 1800);
}

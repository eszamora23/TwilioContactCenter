import { ChatController } from './chat.controller.js';
import { VideoController } from './video.controller.js';
import { SessionStore } from '../services/session.store.js';
import '../ui/messages.view.js';
import { initFormsUI } from '../ui/forms.view.js';
import '../ui/shell.ui.js';
import { bus } from '../services/bus.js';

const chat  = new ChatController();
const video = new VideoController();

initFormsUI({ chat, video });

// Enviar mensajes de sistema por eventos de video
let suppressVideoStartMessageOnce = false;

bus.on('video:started', () => {
  if (suppressVideoStartMessageOnce) { suppressVideoStartMessageOnce = false; return; }
  try { chat.send('[system] Video call started'); } catch {}
});
bus.on('video:ended', () => {
  try { chat.send('[system] Video call ended'); } catch {}
});

// Boot: reanudar conversación (y video si estaba activo)
(async function boot(){
  const convo = await chat.resumeOrStart(SessionStore.convoSid);
  if (convo && SessionStore.videoActive) {
    suppressVideoStartMessageOnce = true; // no reenviar mensaje al reanudar
    setTimeout(() => video.start(convo.sid, undefined, { auto:true }).catch(console.error), 400);
  }
})();

// Desconectar video al navegar fuera
window.addEventListener('beforeunload', () => {
  try { video.end(); } catch {}
});

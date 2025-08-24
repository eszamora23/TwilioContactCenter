import { bus } from '../services/bus.js';
import { byId, show, hide } from './dom.js';

const videoShell   = byId('video-container');
const localMedia   = byId('local-media');
const remoteMedia  = byId('remote-media');
const startVideoBtn= byId('start-video');
const endVideoBtn  = byId('end-video');

let currentRoom = null;

export function attachPreviewTracks(previewTracks){
  try {
    if(!localMedia) return;
    localMedia.innerHTML = '';
    previewTracks.forEach(t => localMedia.appendChild(t.attach()));
  } catch {}
}

function attachParticipant(p){
  const holder = remoteMedia;
  if(!holder) return;

  const attachTrack = (track) => {
    const el = track.attach();
    el.dataset.name = track.name;
    holder.appendChild(el);
  };
  const detachTrack = (track) => {
    try { track.detach().forEach(el => el.remove()); } catch {}
  };

  // Attach ya publicados
  p.tracks.forEach(pub => { if(pub.track) attachTrack(pub.track); });

  // Subscripciones
  p.on('trackSubscribed', attachTrack);
  p.on('trackUnsubscribed', detachTrack);

  // Cleanup al desconectar participante
  p.on('disconnected', () => {
    try { p.tracks.forEach(pub => pub.track?.detach()?.forEach(el => el.remove())); } catch {}
  });
}

bus.on('video:started', (room) => {
  currentRoom = room;
  // UI
  show(videoShell);
  hide(startVideoBtn);
  show(endVideoBtn);

  // Limpiar contenedores remotos
  if (remoteMedia) remoteMedia.innerHTML = '';

  // Adjuntar participantes existentes
  Array.from(room.participants.values()).forEach(attachParticipant);

  // También podríamos escuchar aquí, pero el controller ya emite evento por cada participantConnected
  // room.on('participantConnected', attachParticipant); // redundante si escuchamos bus
});

bus.on('video:participant:connected', (p) => attachParticipant(p));

bus.on('video:ended', () => {
  try {
    // Detach tracks locales/remotos
    if (currentRoom) {
      try { currentRoom.localParticipant.tracks.forEach(pub => pub.track?.detach()?.forEach(el => el.remove())); } catch {}
    }
    if (remoteMedia) remoteMedia.innerHTML = '';
  } catch {}
  currentRoom = null;
  // UI
  hide(endVideoBtn);
  show(startVideoBtn);
  hide(videoShell);
});

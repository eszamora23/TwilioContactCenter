// contact-center/client/src/features/video/hooks/useVideoRoom.js
import { useEffect, useRef, useState } from 'react';
import Video from 'twilio-video';

export default function useVideoRoom() {
  const roomRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => () => {
    try { roomRef.current?.disconnect(); } catch {}
  }, []);

  const connect = async ({ token, roomName }) => {
    if (!token || !roomName || roomRef.current) return;
    setConnecting(true);
    const r = await Video.connect(token, {
      name: roomName,
      audio: true,
      video: { width: 640 },
    });
    roomRef.current = r;
    setRoom(r);

    const makeList = () => Array.from(r.participants.values());
    setParticipants(makeList());

    const onParticipantConnected = () => setParticipants(makeList());
    const onParticipantDisconnected = () => setParticipants(makeList());
    const onDisconnected = () => {
      setParticipants([]);
      setRoom(null);
      roomRef.current = null;
    };

    r.on('participantConnected', onParticipantConnected);
    r.on('participantDisconnected', onParticipantDisconnected);
    r.on('disconnected', onDisconnected);

    setConnecting(false);
  };

  const disconnect = async () => {
    try { roomRef.current?.disconnect(); } finally {
      roomRef.current = null;
      setRoom(null);
      setParticipants([]);
    }
  };

  return { room, participants, connecting, connect, disconnect };
}

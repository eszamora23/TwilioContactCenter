// contact-center/client/src/features/video/components/VideoPanel.jsx
import { useEffect, useRef } from 'react';
import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';

export default function VideoPanel({ room, participants, onClose }) {
    const localRef = useRef(null);

    useEffect(() => {
        if (!room) return;
        const local = room.localParticipant;
        local.tracks.forEach((pub) => {
            const track = pub.track;
            if (!track || !localRef.current) return;
            if (localRef.current.querySelector(`[data-track-sid="${track.sid}"]`)) return;
            const el = track.attach();
            el.dataset.trackSid = track.sid;
            localRef.current.appendChild(el);
        });
        return () => {
            try { local.tracks.forEach((pub) => pub.track?.detach()?.forEach((el) => el.remove())); } catch { }
        };
    }, [room]);


    return (
        <Box borderStyle="solid" borderColor="colorBorderWeaker" borderWidth="borderWidth10" borderRadius="borderRadius30" padding="space60">
            <Box display="flex" columnGap="space60" style={{ flexWrap: 'wrap' }}>
                <Box flex="1" minWidth="280px">
                    <h4 style={{ marginTop: 0 }}>You</h4>
                    <div ref={localRef} />
                </Box>
                {participants.map(p => (
                    <RemoteParticipant key={p.sid} participant={p} />
                ))}
            </Box>
            <Box marginTop="space60">
                <Button variant="destructive" onClick={onClose}>End video</Button>
            </Box>
        </Box>
    );
}

function RemoteParticipant({ participant }) {
    const holder = useRef(null);

    useEffect(() => {
        if (!participant) return;

        const attachTrack = (track) => {
            if (!holder.current || !track) return;
            if (holder.current.querySelector(`[data-name="${track.name}"]`)) return;
            const el = track.attach();
            el.dataset.name = track.name;
            holder.current.appendChild(el);
        };

        const detachTrack = (track) => {
            try {
                track?.detach()?.forEach((el) => el.remove());
            } catch { }
        };

        // Adjunta lo que ya está publicado (si ya hay suscripción)
        participant.tracks.forEach((pub) => {
            if (pub.track) attachTrack(pub.track);
            pub.on('subscribed', attachTrack);
            pub.on('unsubscribed', detachTrack);
        });

        // Y escucha los eventos del participante
        const onTrackSubscribed = (track) => attachTrack(track);
        const onTrackUnsubscribed = (track) => detachTrack(track);

        participant.on('trackSubscribed', onTrackSubscribed);
        participant.on('trackUnsubscribed', onTrackUnsubscribed);

        return () => {
            try {
                participant.off('trackSubscribed', onTrackSubscribed);
                participant.off('trackUnsubscribed', onTrackUnsubscribed);
                participant.tracks.forEach((pub) => {
                    pub.off('subscribed', attachTrack);
                    pub.off('unsubscribed', detachTrack);
                    detachTrack(pub.track);
                });
            } catch { }
        };
    }, [participant]);

    return (
        <Box flex="1" minWidth="280px">
            <h4 style={{ marginTop: 0 }}>{participant.identity}</h4>
            <div ref={holder} />
        </Box>
    );
}


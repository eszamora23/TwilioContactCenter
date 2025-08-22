import React from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '@twilio-paste/core/button-group';
import { Button } from '@twilio-paste/core/button';
import { Tooltip } from '@twilio-paste/core/tooltip';
import { Menu, MenuButton, MenuItem, useMenuState } from '@twilio-paste/core/menu';

import { CallIcon } from '@twilio-paste/icons/esm/CallIcon';
import { DialpadIcon } from '@twilio-paste/icons/esm/DialpadIcon';
import { CallHoldIcon } from '@twilio-paste/icons/esm/CallHoldIcon';
import { MoreIcon } from '@twilio-paste/icons/esm/MoreIcon';
import { MicrophoneOnIcon } from '@twilio-paste/icons/esm/MicrophoneOnIcon';
import { MicrophoneOffIcon } from '@twilio-paste/icons/esm/MicrophoneOffIcon';

export default function CallControlBar({
  callStatus,
  isMuted,
  holding,
  recStatus,
  hangup,
  toggleMute,
  holdStart,
  holdStop,
  recStart,
  recPause,
  recResume,
  recStop,
  onOpenDtmf,
}) {
  const { t } = useTranslation();
  const menu = useMenuState();

  const inCall = callStatus === 'In Call';
  const canHang = inCall || callStatus === 'Incoming';

  return (
    <>
      <ButtonGroup>
        <Tooltip text={isMuted ? t('unmute') : t('mute')}>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => toggleMute(!isMuted)}
            aria-label={isMuted ? t('unmuteAria') : t('muteAria')}
            aria-pressed={isMuted}
          >
            {isMuted ? <MicrophoneOffIcon decorative /> : <MicrophoneOnIcon decorative />}
          </Button>
        </Tooltip>

        <Tooltip text={t('hangup')}>
          <Button
            variant="destructive"
            size="icon"
            onClick={hangup}
            aria-label={t('hangupAria')}
            disabled={!canHang}
          >
            <CallIcon decorative />
          </Button>
        </Tooltip>

        <Tooltip text={t('dtmf')}>
          <Button
            variant="secondary"
            size="icon"
            onClick={onOpenDtmf}
            aria-label={t('dtmfAria')}
            disabled={!inCall}
          >
            <DialpadIcon decorative />
          </Button>
        </Tooltip>

        <Tooltip text={holding ? t('resume') : t('hold')}>
          <Button
            variant="secondary"
            size="icon"
            onClick={holding ? holdStop : holdStart}
            aria-label={holding ? t('resumeAria') : t('holdAria')}
            aria-pressed={holding}
            disabled={!inCall}
          >
            <CallHoldIcon decorative />
          </Button>
        </Tooltip>

        <Tooltip text={t('more')}>
          <MenuButton {...menu} variant="secondary" aria-label={t('more')}>
            <MoreIcon decorative />
          </MenuButton>
        </Tooltip>
      </ButtonGroup>

      <Menu {...menu} aria-label={t('more')}>
        <MenuItem
          onClick={recStart}
          disabled={!inCall || (recStatus !== 'inactive' && recStatus !== 'stopped')}
        >
          {t('startRecTitle')}
        </MenuItem>
        <MenuItem onClick={recPause} disabled={recStatus !== 'in-progress'}>
          {t('pauseRecTitle')}
        </MenuItem>
        <MenuItem onClick={recResume} disabled={recStatus !== 'paused'}>
          {t('resumeRecTitle')}
        </MenuItem>
        <MenuItem onClick={recStop} disabled={recStatus === 'inactive'}>
          {t('stopRecTitle')}
        </MenuItem>
      </Menu>
    </>
  );
}

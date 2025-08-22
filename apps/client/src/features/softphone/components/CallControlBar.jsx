import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '@twilio-paste/core/button-group';
import { IconButton } from '@twilio-paste/core/button';
import { Tooltip } from '@twilio-paste/core/tooltip';
import { Menu, MenuButton, MenuItem, useMenuState } from '@twilio-paste/core/menu';
import { HangUpIcon } from '@twilio-paste/icons/esm/HangUpIcon';
import { DialpadIcon } from '@twilio-paste/icons/esm/DialpadIcon';
import { HoldIcon } from '@twilio-paste/icons/esm/HoldIcon';
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

  return (
    <>
      <ButtonGroup>
        <Tooltip text={isMuted ? t('unmute') : t('mute')}>
          <IconButton
            onClick={() => toggleMute(!isMuted)}
            icon={
              isMuted ? (
                <MicrophoneOffIcon decorative />
              ) : (
                <MicrophoneOnIcon decorative />
              )
            }
            aria-label={isMuted ? t('unmuteAria') : t('muteAria')}
            variant="secondary"
            pressed={isMuted}
          />
        </Tooltip>

        <Tooltip text={t('hangup')}>
          <IconButton
            onClick={hangup}
            icon={<HangUpIcon decorative />}
            aria-label={t('hangupAria')}
            variant="destructive"
            disabled={callStatus !== 'In Call' && callStatus !== 'Incoming'}
          />
        </Tooltip>

        <Tooltip text={t('dtmf')}>
          <IconButton
            onClick={onOpenDtmf}
            icon={<DialpadIcon decorative />}
            aria-label={t('dtmfAria')}
            variant="secondary"
            disabled={callStatus !== 'In Call'}
          />
        </Tooltip>

        <Tooltip text={holding ? t('resume') : t('hold')}>
          <IconButton
            onClick={holding ? holdStop : holdStart}
            icon={<HoldIcon decorative />}
            aria-label={holding ? t('resumeAria') : t('holdAria')}
            variant="secondary"
            disabled={callStatus !== 'In Call'}
            pressed={holding}
          />
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
          disabled={
            callStatus !== 'In Call' || (recStatus !== 'inactive' && recStatus !== 'stopped')
          }
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

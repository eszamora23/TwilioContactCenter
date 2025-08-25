// contact-center/client/src/components/AgentDesktopShell.jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { TextArea } from '@twilio-paste/core/textarea';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarCollapseButton,
} from '@twilio-paste/core/sidebar';

const SIDEBAR_W = 300;
const SHELL_HEADER_H = 64;

/* Responsive breakpoint hook */
function useIsDesktop() {
  const mq = '(min-width: 1024px)';
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.matchMedia(mq).matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(mq);

    const onChange = (e) => setIsDesktop(e.matches);
    try {
      mql.addEventListener('change', onChange);
    } catch {
      mql.addListener(onChange);
    }

    return () => {
      try {
        mql.removeEventListener('change', onChange);
      } catch {
        mql.removeListener(onChange);
      }
    };
  }, []);

  return isDesktop;
}

export default function AgentDesktopShell({
  sections, // interface legacy (no-op)
  title = 'Agent Desktop',
  actions,
  footer,
  children,
  topOffset = 0,
  measureTopFrom,
  mode = 'voice', // interface legacy (no-op)
  quickActions, // interface legacy (no-op)
}) {
  const isDesktop = useIsDesktop();

  // Expose header height CSS var
  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--shell-header-h', `${SHELL_HEADER_H}px`);
    } catch {}
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRootRef = useRef(null);

  // Sticky offset under external headers
  const [offset, setOffset] = useState(topOffset);
  useEffect(() => setOffset(topOffset), [topOffset]);

  // Track another sticky element height (optional)
  useEffect(() => {
    if (!measureTopFrom) return;
    const el = document.getElementById(measureTopFrom);
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height || 0;
      setOffset(Math.round(h));
    });

    ro.observe(el);
    setOffset(Math.round(el.getBoundingClientRect().height || 0));
    return () => ro.disconnect();
  }, [measureTopFrom]);

  // Scratchpad (persistent)
  const [pad, setPad] = useLocalStorage('agent_pad', '');

  /* =========================
   * Sidebar (simplified for note-taking focus, with high contrast)
   * ========================= */
  const SidebarInner = (
    <>
      <SidebarHeader
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--paste-color-background-body-inverse)',
          borderBottom: '1px solid var(--paste-color-border-weak)',
          backdropFilter: 'saturate(180%) blur(20px)',
        }}
      >
        <SidebarHeaderLabel style={{ color: 'var(--paste-color-text-inverse)' }}>Notes & Tips</SidebarHeaderLabel>
        {!isDesktop && (
          <SidebarCollapseButton
            i18nCollapseLabel="Hide panel"
            i18nExpandLabel="Show panel"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </SidebarHeader>

      <SidebarBody style={{ background: 'var(--paste-color-background-body-inverse)' }}>
        {/* Scratchpad as primary focus, with modern styling, larger size, and high contrast */}
        <Box padding="space60">
          <Heading as="h5" variant="heading50" marginBottom="space40" style={{ color: 'var(--paste-color-text-inverse)' }}>
            Scratchpad
          </Heading>
          <Box
            backgroundColor="colorBackgroundStronger"
            borderRadius="borderRadius30"
            borderWidth="borderWidth10"
            borderColor="colorBorderWeak"
            borderStyle="solid"
            padding="space50"
            boxShadow="shadow"
            minHeight="400px" // Make the note part bigger
            display="flex"
            flexDirection="column"
          >
            <TextArea
              value={pad}
              onChange={(e) => setPad(e.target.value)}
              placeholder="Jot down quick notes, ideas, or reminders here... Everything is saved locally."
              style={{
                background: 'transparent',
                color: 'var(--paste-color-text-inverse)',
                resize: 'vertical',
                border: 'none',
                flexGrow: 1,
                fontSize: 'fontSize30',
                lineHeight: 'lineHeight30',
              }}
            />
          </Box>
        </Box>

        {/* Condensed key insights, with high contrast */}
        <Box padding="space60" paddingTop="space0">
          <Heading as="h5" variant="heading50" marginBottom="space40" style={{ color: 'var(--paste-color-text-inverse)' }}>
            Key Tips
          </Heading>
          <Box
            backgroundColor="colorBackgroundStronger"
            borderRadius="borderRadius30"
            borderWidth="borderWidth10"
            borderColor="colorBorderWeak"
            borderStyle="solid"
            padding="space50"
            boxShadow="shadow"
          >
            <ul style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc', fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--paste-color-text-inverse)' }}>
              <li><strong>Modes:</strong> Switch via top tabs: VOICE, CHAT, SUPERVISOR.</li>
              <li><strong>Voice:</strong> Softphone in card; separate window option. Closing disables auto-reopen.</li>
              <li><strong>Voice Tasks:</strong> Under Customer 360 in VOICE.</li>
              <li><strong>Supervisor:</strong> Shows Reservations & Presence only.</li>
              <li><strong>Activity:</strong> Status selector in header is authoritative.</li>
              <li><strong>Chats:</strong> Open in tabs; pop out with ↗.</li>
              <li><strong>Notes:</strong> Saved locally only.</li>
            </ul>
          </Box>
        </Box>
      </SidebarBody>

      {footer ? (
        <>
          <Separator orientation="horizontal" verticalSpacing="space40" />
          <Box padding="space60" style={{ background: 'var(--paste-color-background-body-inverse)', color: 'var(--paste-color-text-inverse)' }}>{footer}</Box>
        </>
      ) : null}
    </>
  );

  /* =========================
   * Layout (minimalist with clean transitions, assuming dark mode support)
   * ========================= */
  return (
    <Box height="100vh" width="100%" overflow="hidden" position="relative">
      {/* Desktop sidebar */}
      {isDesktop && (
        <Box
          as="aside"
          position="fixed"
          top={`${offset}px`}
          left={0}
          width={`${SIDEBAR_W}px`}
          height={`calc(100vh - ${offset}px)`}
          zIndex={5}
          style={{ borderRight: '1px solid var(--paste-color-border-weak)' }}
        >
          <Sidebar variant="default" width="100%" maxHeight="100%" overflowY="auto" collapsed={false}>
            {SidebarInner}
          </Sidebar>
        </Box>
      )}

      {/* Main column */}
      <Box
        as="main"
        display="flex"
        flexDirection="column"
        height="100vh"
        overflow="hidden"
        paddingLeft={isDesktop ? `${SIDEBAR_W}px` : '0'}
        style={{ background: 'var(--paste-color-background-body)' }}
      >
        {/* Sticky header */}
        <Box
          as="header"
          paddingX="space70"
          paddingY="space50"
          backgroundColor="colorBackgroundBody"
          style={{
            borderBottom: '1px solid var(--paste-color-border-weak)',
            position: 'sticky',
            top: `${offset}px`,
            zIndex: 6,
            backdropFilter: 'saturate(180%) blur(20px)',
            height: `${SHELL_HEADER_H}px`,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Stack
            orientation="horizontal"
            spacing="space60"
            alignment="center"
            distribution="spaceBetween"
            width="100%"
          >
            <Heading as="h3" variant="heading30" margin="space0">
              {title}
            </Heading>
            {actions || null}
          </Stack>
        </Box>

        {/* Scroll area */}
        <Box
          id="shell-scroll-root"
          ref={scrollRootRef}
          flexGrow={1}
          minHeight="0"
          overflow="auto"
          backgroundColor="colorBackgroundBody"
        >
          <Box as="section" padding="space70" style={{ margin: '0 auto', maxWidth: 1280 }}>
            {children}
          </Box>
        </Box>
      </Box>

      {/* Mobile drawer */}
      {!isDesktop && drawerOpen && (
        <>
          <Box
            id="shell-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Notes & Tips"
            position="fixed"
            top={`${offset}px`}
            left={0}
            height={`calc(100vh - ${offset}px)`}
            width="min(80vw, 320px)"
            zIndex={11}
            backgroundColor="colorBackgroundBody"
            style={{ borderRight: '1px solid var(--paste-color-border-weak)' }}
          >
            <Sidebar variant="default" width="100%" maxHeight="100%" overflowY="auto" collapsed={false}>
              {SidebarInner}
            </Sidebar>
          </Box>

          <Box
            position="fixed"
            top={`${offset}px`}
            left={0}
            width="100vw"
            height={`calc(100vh - ${offset}px)`}
            zIndex={10}
            backgroundColor="colorBackground"
            style={{ opacity: 0.3 }}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        </>
      )}
    </Box>
  );
}

AgentDesktopShell.propTypes = {
  sections: PropTypes.array.isRequired,
  title: PropTypes.string,
  actions: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node.isRequired,
  topOffset: PropTypes.number,
  measureTopFrom: PropTypes.string,
  mode: PropTypes.oneOf(['voice', 'chat', 'supervisor']),
  quickActions: PropTypes.object,
};
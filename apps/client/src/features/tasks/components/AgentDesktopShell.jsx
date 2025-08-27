// contact-center/client/src/features/tasks/components/AgentDesktopShell.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo, Children, isValidElement, cloneElement } from 'react';
import PropTypes from 'prop-types';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { TextArea } from '@twilio-paste/core/textarea';
import { Button } from '@twilio-paste/core/button';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarCollapseButton,
} from '@twilio-paste/core/sidebar';
import {
  Disclosure,
  DisclosureHeading,
  DisclosureContent
} from '@twilio-paste/core/disclosure';

const SIDEBAR_W = 280;
const SHELL_HEADER_H = 56;

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
    try { mql.addEventListener('change', onChange); } catch { mql.addListener(onChange); }

    return () => {
      try { mql.removeEventListener('change', onChange); } catch { mql.removeListener(onChange); }
    };
  }, []);

  return isDesktop;
}

/* Helpers */
function clickTab(id) {
  try {
    const el = document.getElementById(id);
    if (el && typeof el.click === 'function') el.click();
  } catch {}
}

// Recursively extract inline StatusBar (identified by props.inline && label && onChange)
function splitActions(node) {
  let hoisted = null;

  const isStatusCandidate = (el) => !!(
    isValidElement(el) && el.props && el.props.inline && ('label' in el.props) && ('onChange' in el.props)
  );

  const walk = (el) => {
    if (Array.isArray(el)) {
      const nextKids = [];
      el.forEach((child) => {
        const [filtered, taken] = walk(child);
        if (taken && !hoisted) hoisted = taken;
        if (filtered !== null && filtered !== undefined) nextKids.push(filtered);
      });
      return [nextKids, hoisted];
    }

    if (!isValidElement(el)) return [el, hoisted];

    if (isStatusCandidate(el)) {
      if (!hoisted) hoisted = el; // keep original; we'll control inline per breakpoint later
      return [null, hoisted];
    }

    const kids = el.props?.children;
    if (!kids) return [el, hoisted];

    const [filteredChildren] = walk(kids);
    const cloned = cloneElement(el, { children: filteredChildren });
    return [cloned, hoisted];
  };

  const [filtered] = walk(node);
  return { filtered, hoisted };
}

export default function AgentDesktopShell({
  sections, // opcional (para navegación)
  title = 'Agent Desktop',
  actions,
  footer,
  children,
  topOffset = 0,
  measureTopFrom,
  mode = 'voice',
  quickActions,
}) {
  const isDesktop = useIsDesktop();

  // Expose header height CSS var
  useEffect(() => {
    try { document.documentElement.style.setProperty('--shell-header-h', `${SHELL_HEADER_H}px`); } catch {}
  }, []);

  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);
  const scrollRootRef = useRef(null);

  // === NEW: persist "Status" dropdown (mobile) open/closed state ===
  const [statusOpen, setStatusOpen] = useLocalStorage('status_dropdown_open', false);
  const statusHeadingHostRef = useRef(null);

  // Keep Disclosure UI in sync with persisted state (mobile only).
  useEffect(() => {
    if (isDesktop) return;
    const host = statusHeadingHostRef.current;
    if (!host) return;
    // Paste renders a button inside the heading; try to find it.
    const btn = host.querySelector('button,[role="button"]') || host;
    if (!btn) return;
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (Boolean(statusOpen) !== expanded) {
      try { btn.click(); } catch {}
    }
  }, [statusOpen, isDesktop]);

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

  // ===== Utilities =====
  const scrollToId = useCallback((id) => {
    if (!id) return;
    const el = document.getElementById(id);
    const root = scrollRootRef.current;
    if (!el || !root) return;
    const rect = el.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const cur = root.scrollTop;
    const target = cur + rect.top - rootRect.top - 12; // small padding under header
    root.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, []);

  const qa = useMemo(() => {
    const list = (quickActions && quickActions[mode]) || (sections || []).map((s) => ({ label: s.label || s.id, targetId: s.id }));
    return list || [];
  }, [quickActions, sections, mode]);

  // Hoist StatusBar from actions
  const { filtered: headerActionsNoStatus, hoisted: statusFromActions } = useMemo(() => splitActions(actions), [actions]);

  // Prepare variants of StatusBar: desktop (non-inline, sticky inside component) and mobile (inline, for dropdown)
  const statusBarDesktop = statusFromActions ? cloneElement(statusFromActions, { inline: false }) : null;
  const statusBarMobile  = statusFromActions ? cloneElement(statusFromActions, { inline: true }) : null;

  /* =========================
   * Sidebar (desktop) — lightweight + Notes bigger + Mode switch
   * ========================= */
  const SidebarInner = (
    <>
      <SidebarHeader style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--paste-color-background)', borderBottom: '1px solid var(--paste-color-border-weak)' }}>
        <SidebarHeaderLabel>Notes</SidebarHeaderLabel>
        {!isDesktop && (
          <SidebarCollapseButton i18nCollapseLabel="Hide" i18nExpandLabel="Show" onClick={() => setMobileNotesOpen(false)} />
        )}
      </SidebarHeader>

      <SidebarBody>
        <Box padding={['space40','space60']}>
          <Stack orientation="vertical" spacing="space50">
            {/* Switch workspace (desktop quick toggle) */}
            <Box>
              <Heading as="h5" variant="heading50" marginBottom="space40">Workspace</Heading>
              <Stack orientation={['vertical','horizontal']} spacing="space30" style={{ flexWrap: 'wrap' }}>
                <Button variant={mode === 'voice' ? 'primary' : 'secondary'} onClick={() => clickTab('voice')} style={{ width: ['100%','auto'] }}>Voice</Button>
                <Button variant={mode === 'chat' ? 'primary' : 'secondary'} onClick={() => clickTab('chat')} style={{ width: ['100%','auto'] }}>Chat</Button>
                <Button variant={mode === 'supervisor' ? 'primary' : 'secondary'} onClick={() => clickTab('supervisor')} style={{ width: ['100%','auto'] }}>Supervisor</Button>
              </Stack>
            </Box>

            {/* Navigate (quick scroll) */}
            {qa?.length ? (
              <Box>
                <Heading as="h5" variant="heading50" marginBottom="space40">Navigate</Heading>
                <Stack orientation="vertical" spacing="space30">
                  {qa.map((q) => (
                    <Button key={q.targetId || q.label} variant={q.variant || 'secondary'} onClick={() => scrollToId(q.targetId)} style={{ width: '100%' }}>
                      {q.label}
                    </Button>
                  ))}
                </Stack>
              </Box>
            ) : null}

            {/* Notes bigger */}
            <Box>
              <Heading as="h5" variant="heading50" marginBottom="space40">Notes</Heading>
              <Box backgroundColor="colorBackground" borderRadius="borderRadius30" borderWidth="borderWidth10" borderColor="colorBorderWeaker" borderStyle="solid" padding="space40">
                <TextArea value={pad} onChange={(e) => setPad(e.target.value)} placeholder="Quick notes... (saved locally)" style={{ resize: 'vertical', minHeight: 420 }} />
              </Box>
            </Box>

            {/* Actions (without StatusBar) */}
            {headerActionsNoStatus ? (
              <>
                <Separator orientation="horizontal" />
                <Box>
                  <Heading as="h5" variant="heading50" marginBottom="space40">Actions</Heading>
                  <Box>{headerActionsNoStatus}</Box>
                </Box>
              </>
            ) : null}

            {footer ? (
              <>
                <Separator orientation="horizontal" />
                <Box>{footer}</Box>
              </>
            ) : null}
          </Stack>
        </Box>
      </SidebarBody>
    </>
  );

  /* =========================
   * Layout
   * ========================= */
  return (
    <Box height="100dvh" width="100%" overflow="hidden" position="relative">
      {/* Safe-area aware padding for scroll root on mobile so bottom nav never covers content */}
      <style>{`
        @media (max-width: 767px){
          #shell-scroll-root{
            padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>

      {/* Desktop sidebar */}
      {isDesktop && (
        <Box as="aside" position="fixed" top={`${offset}px`} left={0} width={`${SIDEBAR_W}px`} height={`calc(100% - ${offset}px)`} minHeight={`calc(100dvh - ${offset}px)`} zIndex={5} style={{ borderRight: '1px solid var(--paste-color-border-weak)' }}>
          <Sidebar variant="default" width="100%" maxHeight="100%" overflowY="auto" collapsed={false}>
            {SidebarInner}
          </Sidebar>
        </Box>
      )}

      {/* Main column */}
      <Box as="main" display="flex" flexDirection="column" height="100dvh" overflow="hidden" paddingLeft={isDesktop ? `${SIDEBAR_W}px` : '0'} style={{ background: 'var(--paste-color-background-body)' }}>
        {/* Sticky header */}
        <Box as="header" paddingX={['space40', 'space70']} paddingY={['space40', 'space50']} backgroundColor="colorBackgroundBody" style={{ borderBottom: '1px solid var(--paste-color-border-weak)', position: 'sticky', top: `${offset}px`, zIndex: 6, height: `${SHELL_HEADER_H}px`, display: 'flex', alignItems: 'center' }}>
          <Stack orientation="horizontal" spacing="space60" alignment="center" distribution="spaceBetween" width="100%">
            <Heading as="h3" variant="heading30" margin="space0">{title}</Heading>
            {isDesktop ? (headerActionsNoStatus || null) : (
              <Button variant="secondary" size="small" onClick={() => setMobileNotesOpen(true)}>Notes</Button>
            )}
          </Stack>
        </Box>

        {/* STATUS: desktop fixed below header; mobile collapsible dropdown (persisted) */}
        {isDesktop ? (
          statusBarDesktop ? <Box>{statusBarDesktop}</Box> : null
        ) : (
          statusBarMobile ? (
            <Box paddingX={['space40','space70']} paddingY="space30" backgroundColor="colorBackgroundBody" style={{ borderBottom: '1px solid var(--paste-color-border-weak)' }}>
              <Disclosure>
                <DisclosureHeading
                  as="h5"
                  ref={statusHeadingHostRef}
                  onClick={() => setStatusOpen((v) => !v)}
                >
                  Status{statusFromActions?.props?.label ? ` — ${statusFromActions.props.label}` : ''}
                </DisclosureHeading>
                <DisclosureContent>
                  {statusBarMobile}
                </DisclosureContent>
              </Disclosure>
            </Box>
          ) : null
        )}

        {/* Scroll area */}
        <Box id="shell-scroll-root" ref={scrollRootRef} flexGrow={1} minHeight="0" overflow="auto" backgroundColor="colorBackgroundBody">
          <Box as="section" padding={['space60', 'space70']} style={{ margin: '0 auto', maxWidth: 1280 }}>
            {children}
          </Box>
        </Box>
      </Box>

      {/* Mobile bottom sheet: NOTES (overlay above everything) */}
      {!isDesktop && mobileNotesOpen && (
        <>
          {/* Backdrop */}
          <Box position="fixed" top={`${offset}px`} left={0} width="100vw" height={`calc(100% - ${offset}px)`} minHeight={`calc(100dvh - ${offset}px)`} zIndex={9998} backgroundColor="colorBackgroundBodyInverse" style={{ opacity: 0.35 }} onClick={() => setMobileNotesOpen(false)} aria-hidden="true" />

          {/* Bottom sheet */}
          <Box role="dialog" aria-modal="true" aria-label="Notes" position="fixed" left={0} right={0} bottom={0} zIndex={9999} backgroundColor="colorBackground" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, boxShadow: '0 -12px 24px rgba(0,0,0,0.25)' }}>
            <Box paddingX="space60" paddingTop="space60" paddingBottom="space80">
              <Stack orientation="vertical" spacing="space70" alignment="stretch">
                <Stack orientation="horizontal" alignment="center" distribution="spaceBetween">
                  <Heading as="h4" variant="heading40" margin="space0">Notes</Heading>
                  <Button variant="secondary" size="small" onClick={() => setMobileNotesOpen(false)}>Close</Button>
                </Stack>

                {/* Mode switch (voice/chat/supervisor) */}
                <Box>
                  <Heading as="h5" variant="heading50" marginBottom="space40">Switch workspace</Heading>
                  <Stack orientation={['vertical','horizontal']} spacing="space30" style={{ flexWrap: 'wrap' }}>
                    <Button variant={mode === 'voice' ? 'primary' : 'secondary'} onClick={() => { clickTab('voice'); setMobileNotesOpen(false); }} style={{ width: ['100%','auto'] }}>Voice</Button>
                    <Button variant={mode === 'chat' ? 'primary' : 'secondary'} onClick={() => { clickTab('chat'); setMobileNotesOpen(false); }} style={{ width: ['100%','auto'] }}>Chat</Button>
                    <Button variant={mode === 'supervisor' ? 'primary' : 'secondary'} onClick={() => { clickTab('supervisor'); setMobileNotesOpen(false); }} style={{ width: ['100%','auto'] }}>Supervisor</Button>
                  </Stack>
                </Box>

                {/* Notes big area */}
                <Box>
                  <Heading as="h5" variant="heading50" marginBottom="space40">Notes</Heading>
                  <Box backgroundColor="colorBackground" borderRadius="borderRadius30" borderWidth="borderWidth10" borderColor="colorBorderWeaker" borderStyle="solid" padding="space40">
                    <TextArea value={pad} onChange={(e) => setPad(e.target.value)} placeholder="Quick notes... (saved locally)" style={{ resize: 'vertical', minHeight: 360 }} />
                  </Box>
                </Box>

                {/* Quick nav */}
                {qa.length ? (
                  <Box>
                    <Heading as="h5" variant="heading50" marginBottom="space40">Navigate</Heading>
                    <Stack orientation="vertical" spacing="space30">
                      {qa.map((q) => (
                        <Button key={q.targetId || q.label} variant={q.variant || 'secondary'} onClick={() => { scrollToId(q.targetId); setMobileNotesOpen(false); }} style={{ width: '100%' }}>
                          {q.label}
                        </Button>
                      ))}
                    </Stack>
                  </Box>
                ) : null}

                {/* Actions (without StatusBar) */}
                {headerActionsNoStatus ? (
                  <Box>
                    <Heading as="h5" variant="heading50" marginBottom="space40">Actions</Heading>
                    <Box>{headerActionsNoStatus}</Box>
                  </Box>
                ) : null}

                {footer ? (
                  <>
                    <Separator orientation="horizontal" />
                    <Box>{footer}</Box>
                  </>
                ) : null}
              </Stack>
            </Box>
          </Box>
        </>
      )}

      {/* ====== MOBILE BOTTOM NAV (persistent, compact, safe-area aware) ====== */}
      <Box
        role="navigation"
        aria-label="Primary navigation"
        display={['block','none']}
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex="zIndex80"
        backgroundColor="colorBackground"
        paddingX="space60"
        paddingTop="space40"
        paddingBottom="space40"
        style={{
          borderTop: '1px solid var(--paste-color-border-weak)',
          paddingBottom: 'calc(var(--paste-space-70) + env(safe-area-inset-bottom, 0px))'
        }}
      >
        <Stack orientation="horizontal" spacing="space40" distribution="equal" alignment="stretch">
          <Button
            size="small"
            variant={mode === 'voice' ? 'primary' : 'secondary'}
            onClick={() => clickTab('voice')}
            aria-current={mode === 'voice' ? 'page' : undefined}
          >
            Voice
          </Button>
          <Button
            size="small"
            variant={mode === 'chat' ? 'primary' : 'secondary'}
            onClick={() => clickTab('chat')}
            aria-current={mode === 'chat' ? 'page' : undefined}
          >
            Chat
          </Button>
          <Button
            size="small"
            variant={mode === 'supervisor' ? 'primary' : 'secondary'}
            onClick={() => clickTab('supervisor')}
            aria-current={mode === 'supervisor' ? 'page' : undefined}
          >
            Supervisor
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

AgentDesktopShell.propTypes = {
  sections: PropTypes.array,
  title: PropTypes.string,
  actions: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node.isRequired,
  topOffset: PropTypes.number,
  measureTopFrom: PropTypes.string,
  mode: PropTypes.oneOf(['voice', 'chat', 'supervisor']),
  quickActions: PropTypes.object,
};

// contact-center/client/src/components/AgentDesktopShell.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
    try {
      document.documentElement.style.setProperty('--shell-header-h', `${SHELL_HEADER_H}px`);
    } catch {}
  }, []);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    // Prefer quickActions by mode; fallback to sections list
    const list = (quickActions && quickActions[mode]) || (sections || []).map((s) => ({
      label: s.label || s.id,
      targetId: s.id,
    }));
    return list || [];
  }, [quickActions, sections, mode]);

  /* =========================
   * Sidebar (desktop only) — más ligera, menos invasiva
   * ========================= */
  const SidebarInner = (
    <>
      <SidebarHeader
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--paste-color-background)',
          borderBottom: '1px solid var(--paste-color-border-weak)'
        }}
      >
        <SidebarHeaderLabel>Quick Menu</SidebarHeaderLabel>
        {!isDesktop && (
          <SidebarCollapseButton
            i18nCollapseLabel="Hide panel"
            i18nExpandLabel="Show panel"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </SidebarHeader>

      <SidebarBody>
        <Box padding={['space40','space60']}>
          <Stack orientation="vertical" spacing="space40">
            {/* Quick actions */}
            <Box>
              <Heading as="h5" variant="heading50" marginBottom="space40">Navigate</Heading>
              <Stack orientation="vertical" spacing="space30">
                {qa.map((q) => (
                  <Button
                    key={q.targetId || q.label}
                    variant={q.variant || 'secondary'}
                    onClick={() => {
                      scrollToId(q.targetId);
                      if (!isDesktop) setMobileMenuOpen(false);
                    }}
                    style={{ width: '100%' }}
                  >
                    {q.label}
                  </Button>
                ))}
              </Stack>
            </Box>

            {/* Actions passed from parent (status, toggles, etc.) */}
            {actions ? (
              <>
                <Separator orientation="horizontal" />
                <Box>
                  <Heading as="h5" variant="heading50" marginBottom="space40">Actions</Heading>
                  <Box>{actions}</Box>
                </Box>
              </>
            ) : null}

            {/* Scratchpad light */}
            <Separator orientation="horizontal" />
            <Disclosure>
              <DisclosureHeading as="h5">Notes</DisclosureHeading>
              <DisclosureContent>
                <Box
                  backgroundColor="colorBackground"
                  borderRadius="borderRadius30"
                  borderWidth="borderWidth10"
                  borderColor="colorBorderWeaker"
                  borderStyle="solid"
                  padding="space40"
                >
                  <TextArea
                    value={pad}
                    onChange={(e) => setPad(e.target.value)}
                    placeholder="Quick notes... (saved locally)"
                    style={{ resize: 'vertical' }}
                  />
                </Box>
              </DisclosureContent>
            </Disclosure>

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
      {/* Desktop sidebar */}
      {isDesktop && (
        <Box
          as="aside"
          position="fixed"
          top={`${offset}px`}
          left={0}
          width={`${SIDEBAR_W}px`}
          height={`calc(100% - ${offset}px)`}
          minHeight={`calc(100dvh - ${offset}px)`}
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
        height="100dvh"
        overflow="hidden"
        paddingLeft={isDesktop ? `${SIDEBAR_W}px` : '0'}
        style={{ background: 'var(--paste-color-background-body)' }}
      >
        {/* Sticky header */}
        <Box
          as="header"
          paddingX={['space40', 'space70']}
          paddingY={['space40', 'space50']}
          backgroundColor="colorBackgroundBody"
          style={{
            borderBottom: '1px solid var(--paste-color-border-weak)',
            position: 'sticky',
            top: `${offset}px`,
            zIndex: 6,
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

            {/* Desktop shows actions inline; Mobile shows a compact Menu button */}
            {isDesktop ? (
              actions || null
            ) : (
              <Button variant="secondary" size="small" onClick={() => setMobileMenuOpen(true)}>
                Menu
              </Button>
            )}
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
          <Box as="section" padding={['space60', 'space70']} style={{ margin: '0 auto', maxWidth: 1280 }}>
            {children}
          </Box>
        </Box>
      </Box>

      {/* Mobile bottom menu (non-invasive) */}
      {!isDesktop && mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <Box
            position="fixed"
            top={`${offset}px`}
            left={0}
            width="100vw"
            height={`calc(100% - ${offset}px)`}
            minHeight={`calc(100dvh - ${offset}px)`}
            zIndex={10}
            backgroundColor="colorBackgroundBodyInverse"
            style={{ opacity: 0.35 }}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom sheet */}
          <Box
            role="dialog"
            aria-modal="true"
            aria-label="Quick Menu"
            position="fixed"
            left={0}
            right={0}
            bottom={0}
            zIndex={11}
            backgroundColor="colorBackground"
            style={{
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              boxShadow: '0 -12px 24px rgba(0,0,0,0.2)'
            }}
          >
            <Box paddingX="space60" paddingTop="space60" paddingBottom="space80">
              <Stack orientation="vertical" spacing="space60" alignment="stretch">
                <Stack orientation="horizontal" alignment="center" distribution="spaceBetween">
                  <Heading as="h4" variant="heading40" margin="space0">Menu</Heading>
                  <Button variant="secondary" size="small" onClick={() => setMobileMenuOpen(false)}>Close</Button>
                </Stack>

                {/* Quick nav */}
                {qa.length ? (
                  <Box>
                    <Heading as="h5" variant="heading50" marginBottom="space40">Navigate</Heading>
                    <Stack orientation="vertical" spacing="space30">
                      {qa.map((q) => (
                        <Button
                          key={q.targetId || q.label}
                          variant={q.variant || 'secondary'}
                          onClick={() => {
                            scrollToId(q.targetId);
                            setMobileMenuOpen(false);
                          }}
                          style={{ width: '100%' }}
                        >
                          {q.label}
                        </Button>
                      ))}
                    </Stack>
                  </Box>
                ) : null}

                {/* Actions */}
                {actions ? (
                  <Box>
                    <Heading as="h5" variant="heading50" marginBottom="space40">Actions</Heading>
                    <Box>{actions}</Box>
                  </Box>
                ) : null}

                {/* Notes (collapsible) */}
                <Disclosure>
                  <DisclosureHeading as="h5">Notes</DisclosureHeading>
                  <DisclosureContent>
                    <Box
                      backgroundColor="colorBackground"
                      borderRadius="borderRadius30"
                      borderWidth="borderWidth10"
                      borderColor="colorBorderWeaker"
                      borderStyle="solid"
                      padding="space40"
                    >
                      <TextArea
                        value={pad}
                        onChange={(e) => setPad(e.target.value)}
                        placeholder="Quick notes... (saved locally)"
                        style={{ resize: 'vertical' }}
                      />
                    </Box>
                  </DisclosureContent>
                </Disclosure>

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

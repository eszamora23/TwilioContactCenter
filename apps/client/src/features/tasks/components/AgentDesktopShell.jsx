// contact-center/client/src/components/AgentDesktopShell.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';

import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { Input } from '@twilio-paste/core/input';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarNavigation,
  SidebarNavigationItem,
  SidebarCollapseButton,
} from '@twilio-paste/core/sidebar';

import { ArrowForwardIcon } from '@twilio-paste/icons/esm/ArrowForwardIcon';

const SIDEBAR_W = 288;
const SHELL_HEADER_H = 68;

/* Responsive */
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

/* =========================
 *   AgentDesktopShell (compact & context-aware)
 * ========================= */
export default function AgentDesktopShell({
  sections,
  title = 'Agent Desktop',
  actions,
  footer,
  children,
  topOffset = 0,
  measureTopFrom,
  mode = 'voice',                             // 'voice' | 'chat'
  quickActions = { voice: [], chat: [] },    // { voice: [{label, targetId?, onClick?, disabled?, variant?}], chat: [...] }
}) {
  const isDesktop = useIsDesktop();

  // expose header height to the rest of the app (e.g., StatusBar)
  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--shell-header-h', `${SHELL_HEADER_H}px`);
    } catch {}
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useLocalStorage('shell_active', sections?.[0]?.id || '');
  const [filter, setFilter] = useState('');
  const scrollRootRef = useRef(null);

  // dynamic offset under external sticky bars
  const [offset, setOffset] = useState(topOffset);
  useEffect(() => setOffset(topOffset), [topOffset]);

  // track another sticky element height (optional)
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

  // ensure active exists
  useEffect(() => {
    if (!sections?.length) return;
    if (!sections.some((s) => s.id === activeId)) setActiveId(sections[0].id);
  }, [sections, activeId, setActiveId]);

  // filter
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sections || [];
    return (sections || []).filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.hint && String(s.hint).toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q))
    );
  }, [sections, filter]);

  // keep active within filtered
  useEffect(() => {
    if (!filtered?.length) return;
    if (!filtered.some((s) => s.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, activeId, setActiveId]);

  // scrollspy → update activeId
  useEffect(() => {
    const root = scrollRootRef.current || document.querySelector('#shell-scroll-root');
    if (!root) return;

    const ids = (sections || []).map((s) => s.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries.find((e) => e.isIntersecting);
        const topMost = first?.target?.id;
        if (topMost) {
          setActiveId(topMost);
          if (history.replaceState) history.replaceState(null, '', `#${encodeURIComponent(topMost)}`);
        }
      },
      { root, threshold: [0.25], rootMargin: `-${offset + SHELL_HEADER_H}px 0px 0px 0px` }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, children, offset]);

  const scrollTo = useCallback((id) => {
    const root = scrollRootRef.current || document.querySelector('#shell-scroll-root');
    const target = document.getElementById(id);
    if (!root || !target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  // hash navigation (first load & popstate)
  useEffect(() => {
    const go = () => {
      const hash = decodeURIComponent((typeof window !== 'undefined' && window.location.hash) || '').replace('#', '');
      if (hash && sections?.some((s) => s.id === hash)) setTimeout(() => scrollTo(hash), 0);
    };
    go();
    window.addEventListener('popstate', go);
    return () => window.removeEventListener('popstate', go);
  }, [sections, scrollTo]);

  // minimal keyboard support (Enter/Space)
  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scrollTo(id);
    }
  };

  // contextual quick actions
  const modeList = (quickActions?.[mode] || []).filter(Boolean);

  const SidebarInner = (
    <>
      <SidebarHeader
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--paste-color-background-body)',
          borderBottom: '1px solid var(--paste-color-border-weak)',
          backdropFilter: 'saturate(140%) blur(6px)',
        }}
      >
        <SidebarHeaderLabel>Navigation</SidebarHeaderLabel>
        {!isDesktop && (
          <SidebarCollapseButton
            i18nCollapseLabel="Hide navigation"
            i18nExpandLabel="Show navigation"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </SidebarHeader>

      {/* Quick actions (VOICE / CHAT aware) */}
      {modeList.length > 0 && (
        <Box padding="space60" paddingBottom="space20">
          <Stack orientation="vertical" spacing="space40">
            <Heading as="h4" variant="heading40" margin="space0">Quick actions</Heading>
            <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
              {modeList.map((a, i) => (
                <Button
                  key={`${mode}-qa-${i}`}
                  size="small"
                  variant={a.variant || 'secondary'}
                  disabled={a.disabled}
                  onClick={() => (a.targetId ? scrollTo(a.targetId) : a.onClick?.())}
                >
                  {a.label}
                </Button>
              ))}
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Finder */}
      <Box padding="space60" paddingTop={modeList.length ? 'space20' : 'space60'} paddingBottom="space20">
        <Input
          id="shell-filter-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sections…"
          aria-label="Filter sections"
        />
      </Box>

      <SidebarBody>
        <SidebarNavigation aria-label="Sections">
          {!filtered.length ? (
            <Box color="colorTextWeak" padding="space60">No matches</Box>
          ) : (
            filtered.map((s) => (
              <SidebarNavigationItem
                key={s.id}
                as="button"
                selected={activeId === s.id}
                aria-label={s.label}
                aria-current={activeId === s.id ? 'page' : undefined}
                onClick={() => scrollTo(s.id)}
                onKeyDown={(e) => handleKeyDown(e, s.id)}
                style={{ outlineOffset: 2 }}
              >
                <Stack
                  orientation="horizontal"
                  spacing="space30"
                  alignment="center"
                  style={{ justifyContent: 'space-between', width: '100%' }}
                >
                  <span style={{ fontWeight: activeId === s.id ? 600 : 500 }}>{s.label}</span>
                  {s.badge ? <span style={{ opacity: 0.75 }}>{s.badge}</span> : null}
                </Stack>
              </SidebarNavigationItem>
            ))
          )}
        </SidebarNavigation>
      </SidebarBody>

      {footer ? (
        <>
          <Separator orientation="horizontal" verticalSpacing="space50" />
          <Box padding="space60">{footer}</Box>
        </>
      ) : null}
    </>
  );

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
          paddingY="space60"
          backgroundColor="colorBackgroundBody"
          style={{
            borderBottom: '1px solid var(--paste-color-border-weak)',
            position: 'sticky',
            top: `${offset}px`,
            zIndex: 6,
            backdropFilter: 'saturate(140%) blur(6px)',
            height: `${SHELL_HEADER_H}px`,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Stack orientation="horizontal" spacing="space60" alignment="center" distribution="spaceBetween" width="100%">
            <Heading as="h3" variant="heading30" margin="space0">
              {title}
            </Heading>
            <Stack orientation="horizontal" spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
              {actions || null}
              {!isDesktop && (
                <Button
                  aria-label="Show navigation"
                  aria-controls="shell-drawer"
                  aria-expanded={drawerOpen}
                  variant="secondary"
                  size="icon"
                  onClick={() => setDrawerOpen(true)}
                >
                  <ArrowForwardIcon decorative />
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>

        {/* Scroll container */}
        <Box
          id="shell-scroll-root"
          ref={scrollRootRef}
          flexGrow={1}
          minHeight="0"
          overflow="auto"
          backgroundColor="colorBackgroundBody"
        >
          <Box as="section" padding="space70" style={{ margin: '0 auto', maxWidth: 1400 }}>
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
            aria-label="Navigation"
            position="fixed"
            top={`${offset}px`}
            left={0}
            height={`calc(100vh - ${offset}px)`}
            width="min(82vw, 340px)"
            zIndex={11}
            boxShadow="shadow"
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
            style={{ opacity: 0.35 }}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        </>
      )}
    </Box>
  );
}

AgentDesktopShell.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      hint: PropTypes.string,
      icon: PropTypes.node,
    })
  ).isRequired,
  title: PropTypes.string,
  actions: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node.isRequired,
  topOffset: PropTypes.number,
  measureTopFrom: PropTypes.string,
  mode: PropTypes.oneOf(['voice', 'chat']),
  quickActions: PropTypes.shape({
    voice: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string.isRequired,
      targetId: PropTypes.string,
      onClick: PropTypes.func,
      disabled: PropTypes.bool,
      variant: PropTypes.oneOf(['primary','secondary','destructive','link']),
    })),
    chat: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string.isRequired,
      targetId: PropTypes.string,
      onClick: PropTypes.func,
      disabled: PropTypes.bool,
      variant: PropTypes.oneOf(['primary','secondary','destructive','link']),
    })),
  }),
};

// contact-center/client/src/components/DashboardLayout.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
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

const SIDEBAR_W = 260;                   // desktop width
const DRAWER_W_CSS = 'min(80vw, 320px)'; // mobile/tablet drawer width

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

export default function DashboardLayout({ sections = [] }) {
  const isDesktop = useIsDesktop();
  const hasSections = sections.length > 0;

  // activa última sección usada o primera
  const initialId =
    (typeof window !== 'undefined' && localStorage.getItem('dl_active')) ||
    (hasSections ? sections[0].id : null);

  const [active, setActive] = useState(initialId);
  const [drawerOpen, setDrawerOpen] = useState(false); // overlay en móvil
  const firstItemRef = useRef(null);

  // cerrar drawer al pasar a desktop
  useEffect(() => { if (isDesktop) setDrawerOpen(false); }, [isDesktop]);

  // foco al abrir el drawer
  useEffect(() => { if (drawerOpen && firstItemRef.current) firstItemRef.current.focus(); }, [drawerOpen]);

  // persistir sección activa
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('dl_active', active || '');
  }, [active]);

  // ESC para cerrar drawer en móvil
  useEffect(() => {
    if (isDesktop) return;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop]);

  const activeSection = useMemo(
    () => sections.find((s) => s.id === active),
    [sections, active]
  );

  const handleSelect = useCallback((id) => {
    setActive(id);
    if (!isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  const onItemKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(id);
    }
  };

  const SidebarInner = (
    <>
      <SidebarHeader
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--paste-color-background-body)',
          borderBottom: '1px solid var(--paste-color-border-weak)',
        }}
      >
        <SidebarHeaderLabel>Menu</SidebarHeaderLabel>
        {!isDesktop && (
          <SidebarCollapseButton
            i18nCollapseLabel="Hide navigation"
            i18nExpandLabel="Show navigation"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </SidebarHeader>

      <SidebarBody>
        {!hasSections ? (
          <Box color="colorTextWeak" padding="space60">No sections available</Box>
        ) : (
          <SidebarNavigation aria-label="Primary navigation">
            {sections.map((section, idx) => {
              const selected = active === section.id;
              const props = {
                key: section.id,
                as: 'button',
                'aria-label': section.label,
                'aria-current': selected ? 'page' : undefined,
                selected,
                onClick: () => handleSelect(section.id),
                onKeyDown: (e) => onItemKeyDown(e, section.id),
                style: { outlineOffset: 2 },
                ref: idx === 0 ? firstItemRef : undefined,
              };
              return <SidebarNavigationItem {...props}>{section.label}</SidebarNavigationItem>;
            })}
          </SidebarNavigation>
        )}
      </SidebarBody>
    </>
  );

  return (
    <Box height="100vh" width="100%" overflow="hidden" position="relative">
      {/* ===== Desktop: sidebar FIXED ===== */}
      {isDesktop && (
        <Box
          as="aside"
          position="fixed"
          top={0}
          left={0}
          width={`${SIDEBAR_W}px`}
          height="100vh"
          zIndex={5}
          style={{ borderRight: '1px solid var(--paste-color-border-weak)' }}
        >
          <Sidebar variant="default" width="100%" maxHeight="100%" overflowY="auto" collapsed={false}>
            {SidebarInner}
          </Sidebar>
        </Box>
      )}

      {/* ===== Contenido ===== */}
      <Box
        as="main"
        display="flex"
        flexDirection="column"
        height="100vh"
        overflow="hidden"
        paddingLeft={isDesktop ? `${SIDEBAR_W}px` : '0'}  // separa contenido en desktop
      >
        <Box
          as="header"
          paddingX="space60"
          paddingY="space50"
          backgroundColor="colorBackgroundBody"
          style={{
            borderBottom: '1px solid var(--paste-color-border-weak)',
            position: 'sticky',
            top: 0,
            zIndex: 3,
          }}
        >
          <Box display="flex" alignItems="center" columnGap="space60">
            {!isDesktop && (
              <Button
                aria-label="Show navigation"
                aria-controls="dl-drawer"
                aria-expanded={drawerOpen}
                variant="secondary"
                size="icon"
                onClick={() => setDrawerOpen(true)}
              >
                <ArrowForwardIcon decorative />
              </Button>
            )}
            <Box as="h3" margin="space0" fontSize="fontSize50" fontWeight="fontWeightSemibold">
              {activeSection?.label ?? 'Dashboard'}
            </Box>
          </Box>
        </Box>

        <Box as="section" flexGrow={1} overflow="auto" padding="space60">
          {hasSections ? (
            sections.map((section) => (
              <Box
                key={section.id}
                display={active === section.id ? 'block' : 'none'}
                backgroundColor="colorBackground"
                borderRadius="borderRadius30"
                boxShadow="shadow"
                padding="space70"
              >
                {section.content}
              </Box>
            ))
          ) : (
            <Box color="colorTextWeak">Nothing to show.</Box>
          )}
        </Box>
      </Box>

      {/* ===== Mobile/Tablet: Drawer overlay (solo si está abierto) ===== */}
      {!isDesktop && drawerOpen && (
        <>
          <Box
            id="dl-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            position="fixed"
            top={0}
            left={0}
            height="100vh"
            width={DRAWER_W_CSS}
            zIndex={11}
            boxShadow="shadow"
            backgroundColor="colorBackgroundBody"
            style={{
              borderRight: '1px solid var(--paste-color-border-weak)',
            }}
          >
            <Sidebar variant="default" width="100%" maxHeight="100%" overflowY="auto" collapsed={false}>
              {SidebarInner}
            </Sidebar>
          </Box>

          <Box
            position="fixed"
            top={0}
            left={0}
            width="100vw"
            height="100vh"
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

DashboardLayout.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      content: PropTypes.node.isRequired,
    })
  ),
};

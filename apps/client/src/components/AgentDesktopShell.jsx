// contact-center/client/src/components/AgentDesktopShell.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useLocalStorage from '../hooks/useLocalStorage.js';
import PropTypes from 'prop-types';

import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { Input } from '@twilio-paste/core/input';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { Badge } from '@twilio-paste/core/badge';

import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarNavigation,
  SidebarNavigationItem,
  SidebarCollapseButton,
} from '@twilio-paste/core/sidebar';

import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from '@twilio-paste/core/modal';

import { ArrowForwardIcon } from '@twilio-paste/icons/esm/ArrowForwardIcon';

const SIDEBAR_W = 280;
const SHELL_HEADER_H = 72; // altura aprox del header interno

/* =========================
 *   Responsive detection
 * ========================= */
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

/* ====================================================================
 *   AgentDesktopShell
 * ====================================================================
 * Props:
 * - sections: [{ id, label, icon?, badge?, hint?, content? }]
 *      content: Node o Function (lazy) que retorna el Node a renderizar en el modal.
 * - title: string
 * - actions?: node (botones a la derecha del header)
 * - footer?: node  (footer del sidebar)
 * - children: contenido (los nodos deben tener id === section.id si no se pasa content)
 * - topOffset?: number (px)    → separa el shell de un header global
 * - measureTopFrom?: string    → id de un elemento externo a medir; si está, usa su altura
 * 
 * Nuevo comportamiento:
 * - Si una sección del menú tiene `content`, al hacer click se abre un popup interno (Modal)
 *   mostrando SOLO ese componente en grande, con botón de cerrar (X + footer).
 *   TIP: si `content` es función, se evalúa on-demand (lazy).
 * - Si la sección NO tiene `content`, se hace scroll suave al elemento con id correspondiente.
 */
export default function AgentDesktopShell({
  sections,
  title = 'Agent Desktop',
  actions,
  footer,
  children,
  topOffset = 0,
  measureTopFrom,
}) {
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useLocalStorage('shell_active', sections?.[0]?.id || '');
  const [filter, setFilter] = useState('');
  const scrollRootRef = useRef(null);
  const navRefs = useRef({});

  // --- offset superior para respetar header/statusbar externos ---
  const [offset, setOffset] = useState(topOffset);
  useEffect(() => setOffset(topOffset), [topOffset]);
  useEffect(() => {
    if (!measureTopFrom) return;
    const el = document.getElementById(measureTopFrom);
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height || 0;
      setOffset(Math.round(h));
    });
    ro.observe(el);
    const h0 = el.getBoundingClientRect().height || 0;
    setOffset(Math.round(h0));
    return () => ro.disconnect();
  }, [measureTopFrom]);

  // ensure stored active section exists
  useEffect(() => {
    if (!sections.some((s) => s.id === activeId)) {
      setActiveId(sections?.[0]?.id || '');
    }
  }, [sections, activeId, setActiveId]);

  // scrollspy para resaltar activo (cuando NO es modal)
  useEffect(() => {
    const root = scrollRootRef.current || document.querySelector('#shell-scroll-root');
    if (!root) return;
    const ids = sections.map((s) => s.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const topMost = visible[0]?.target?.id;
        if (topMost) {
          setActiveId(topMost);
          if (history.replaceState) history.replaceState(null, '', `#${topMost}`);
        }
      },
      {
        root,
        threshold: [0.3, 0.6, 0.9],
        rootMargin: `-${offset + SHELL_HEADER_H}px 0px 0px 0px`,
      }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, children, offset]);

  // scroll a sección (fallback)
  const scrollTo = useCallback(
    (id) => {
      const root = scrollRootRef.current || document.querySelector('#shell-scroll-root');
      const target = document.getElementById(id);
      if (!root || !target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!isDesktop) setDrawerOpen(false);
    },
    [isDesktop]
  );

  // saltar a hash si existe
  useEffect(() => {
    const hash = decodeURIComponent((typeof window !== 'undefined' && window.location.hash) || '').replace('#', '');
    if (hash && sections.some((s) => s.id === hash)) {
      setTimeout(() => scrollTo(hash), 0);
    }
  }, [sections, scrollTo]);

  // filtrar items
  const filteredSections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) => s.label.toLowerCase().includes(q) || (s.hint && String(s.hint).toLowerCase().includes(q))
    );
  }, [sections, filter]);

  // teclado en sidebar
  const focusIndexById = (id) => filteredSections.findIndex((s) => s.id === id);
  const handleKeyDown = (e) => {
    if (!filteredSections.length) return;
    const idx = Math.max(0, focusIndexById(activeId));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filteredSections[Math.min(idx + 1, filteredSections.length - 1)];
      if (next) {
        setActiveId(next.id);
        navRefs.current[next.id]?.focus();
        handleSectionInvoke(next);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredSections[Math.max(idx - 1, 0)];
      if (prev) {
        setActiveId(prev.id);
        navRefs.current[prev.id]?.focus();
        handleSectionInvoke(prev);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const s = filteredSections[idx] || null;
      if (s) handleSectionInvoke(s);
    }
  };

  /* =========================
   *  POPUP INTERNO (Modal)
   * ========================= */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSection, setModalSection] = useState(null);

  // abrir sección: si trae content → modal; si no → scroll
  function handleSectionInvoke(section) {
    if (section?.content) {
      setModalSection(section);
      setModalOpen(true);
      if (!isDesktop) setDrawerOpen(false);
    } else {
      scrollTo(section.id);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setModalSection(null);
  }

  /* =========================
   *  Sidebar inner
   * ========================= */
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

      {/* Buscador */}
      <Box padding="space60" paddingBottom="space20">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sections…"
          aria-label="Filter sections"
          onKeyDown={handleKeyDown}
        />
      </Box>

      <SidebarBody>
        <SidebarNavigation aria-label="Primary navigation">
          {!filteredSections.length ? (
            <Box color="colorTextWeak" padding="space60">
              No matches
            </Box>
          ) : (
            filteredSections.map((s) => (
              <SidebarNavigationItem
                key={s.id}
                as="button"
                selected={activeId === s.id}
                aria-label={s.label}
                aria-current={activeId === s.id ? 'page' : undefined}
                onClick={() => handleSectionInvoke(s)}
                onKeyDown={handleKeyDown}
                style={{ outlineOffset: 2, justifyContent: 'space-between' }}
                ref={(el) => (navRefs.current[s.id] = el)}
              >
                <Stack orientation="horizontal" spacing="space30" alignment="center">
                  {s.icon ? <span aria-hidden="true">{s.icon}</span> : null}
                  <span>{s.label}</span>
                </Stack>
                {s.badge ? <Badge as="span" variant="new">{s.badge}</Badge> : null}
              </SidebarNavigationItem>
            ))
          )}
        </SidebarNavigation>
      </SidebarBody>

      {/* Footer opcional */}
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
      {/* Sidebar fija desktop */}
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

      {/* Área principal */}
      <Box
        as="main"
        display="flex"
        flexDirection="column"
        height="100vh"
        overflow="hidden"
        paddingLeft={isDesktop ? `${SIDEBAR_W}px` : '0'}
      >
        {/* Header sticky */}
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
          }}
        >
          <Stack orientation="horizontal" spacing="space60" alignment="center" distribution="spaceBetween">
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

        {/* Contenedor scrollable (contenido normal) */}
        <Box
          id="shell-scroll-root"
          ref={scrollRootRef}
          flexGrow={1}
          minHeight="0"
          overflow="auto"
          backgroundColor="colorBackgroundBody"
        >
          <Box padding="space70">{children}</Box>
        </Box>
      </Box>

      {/* Drawer móvil/tablet */}
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
            width="min(80vw, 320px)"
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

      {/* ============ POPUP INTERNO (MODAL) PARA SECCIONES ============ */}
      <Modal isOpen={modalOpen} onDismiss={closeModal} size="wide">
        <ModalHeader>
          <ModalHeading>{modalSection?.label || 'Detail'}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          {/* Si la sección trajo content, lo renderizamos aquí (soporta lazy: función) */}
          <Box>
            {typeof modalSection?.content === 'function'
              ? modalSection.content()
              : (modalSection?.content || null)}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={closeModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </Box>
  );
}

AgentDesktopShell.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.node,    // optional icon
      badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      hint: PropTypes.string,  // text used in filtering
      // contenido para abrir en popup interno; acepta nodo o función (lazy)
      content: PropTypes.oneOfType([PropTypes.node, PropTypes.func]),
    })
  ).isRequired,
  title: PropTypes.string,
  actions: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node.isRequired,
  topOffset: PropTypes.number,
  measureTopFrom: PropTypes.string,
};

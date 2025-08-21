import { useState } from 'react';
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
  SidebarContainer,
  SidebarPushContentWrapper,
} from '@twilio-paste/core/sidebar';
import { useDisclosureState as useDisclosure } from '@twilio-paste/core/disclosure';
import { ArrowForwardIcon } from '@twilio-paste/icons/esm/ArrowForwardIcon';

export default function DashboardLayout({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  const disclosure = useDisclosure({ visible: true });

  const handleSelect = (id) => {
    setActive(id);
    if (disclosure.visible) {
      disclosure.hide();
    }
  };

  return (
    <SidebarContainer maxHeight="100vh" overflowY="auto">
      <Sidebar
        variant="default"
        width={["100%", "240px"]}
        flexShrink={0}
        maxHeight="100vh"
        overflowY="auto"
        collapsed={!disclosure.visible}
      >
        <SidebarHeader>
          <SidebarHeaderLabel>Menu</SidebarHeaderLabel>
          <SidebarCollapseButton
            display={["flex", "flex", "none"]}
            i18nCollapseLabel="Hide navigation"
            i18nExpandLabel="Show navigation"
            onClick={disclosure.toggle}
          />
        </SidebarHeader>
        <SidebarBody>
          <SidebarNavigation aria-label="Primary navigation">
            {sections.map((section) => (
              <SidebarNavigationItem
                key={section.id}
                as="button"
                aria-label={section.label}
                selected={active === section.id}
                onClick={() => handleSelect(section.id)}
              >
                {section.label}
              </SidebarNavigationItem>
            ))}
          </SidebarNavigation>
        </SidebarBody>
      </Sidebar>

      <SidebarPushContentWrapper collapsed={!disclosure.visible}>
        <Box as="main" flexGrow={1} overflow="auto" padding="space60">
          {!disclosure.visible && (
            <Button
              aria-label="Show navigation"
              variant="secondary"
              size="icon"
              marginBottom="space60"
              onClick={disclosure.toggle}
            >
              <ArrowForwardIcon decorative={false} />
            </Button>
          )}
          {sections.map((section) => (
            <Box key={section.id} display={active === section.id ? 'block' : 'none'}>
              {section.content}
            </Box>
          ))}
        </Box>
      </SidebarPushContentWrapper>
    </SidebarContainer>
  );
}

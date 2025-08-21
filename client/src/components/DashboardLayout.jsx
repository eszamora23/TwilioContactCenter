import { useState } from 'react';
import { Box } from '@twilio-paste/core/box';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarNavigation,
  SidebarNavigationItem,
  SidebarCollapseButton,
  SidebarPushContentWrapper,
} from '@twilio-paste/core/sidebar';
import { useDisclosureState as useDisclosure } from '@twilio-paste/core/disclosure';

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
    <SidebarPushContentWrapper
      collapsed={!disclosure.visible}
      display="flex"
      minHeight="size100vh"
    >
      <Sidebar
        variant="default"
        width="240px"
        flexShrink={0}
        height="100vh"
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
                href="#"
                selected={active === section.id}
                onClick={() => handleSelect(section.id)}
              >
                {section.label}
              </SidebarNavigationItem>
            ))}
          </SidebarNavigation>
        </SidebarBody>
      </Sidebar>

      <Box as="main" flexGrow={1} overflow="auto" padding="space60">
        {sections.map((section) => (
          <Box key={section.id} display={active === section.id ? 'block' : 'none'}>
            {section.content}
          </Box>
        ))}
      </Box>
    </SidebarPushContentWrapper>
  );
}

import { useState } from 'react';
import { Box } from '@twilio-paste/core/box';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarNavigation,
  SidebarNavigationItem,
  SidebarPushContentWrapper,
} from '@twilio-paste/core/sidebar';

export default function DashboardLayout({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);

  return (
    <Box display="flex" minHeight="size100vh">
      <Sidebar variant="default" flexShrink={0}>
        <SidebarHeader>
          <SidebarHeaderLabel>Menu</SidebarHeaderLabel>
        </SidebarHeader>
        <SidebarBody>
          <SidebarNavigation aria-label="Primary navigation">
            {sections.map((section) => (
              <SidebarNavigationItem
                key={section.id}
                href="#"
                selected={active === section.id}
                onClick={() => setActive(section.id)}
              >
                {section.label}
              </SidebarNavigationItem>
            ))}
          </SidebarNavigation>
        </SidebarBody>
      </Sidebar>
      <SidebarPushContentWrapper overflow="auto">
        <Box padding="space60">
          {sections.map((section) => (
            <Box key={section.id} display={active === section.id ? 'block' : 'none'}>
              {section.content}
            </Box>
          ))}
        </Box>
      </SidebarPushContentWrapper>
    </Box>
  );
}

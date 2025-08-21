import { useState } from 'react';
import { Box } from '@twilio-paste/core/box';
import {
  Sidebar,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarBody,
  SidebarNavigation,
  SidebarNavigationItem,
} from '@twilio-paste/core/sidebar';

export default function DashboardLayout({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);

  return (
    <Box
      display="grid"
      gridTemplateColumns={["1fr", "1fr", "240px 1fr"]}
      minHeight="size100vh"
    >
      <Sidebar variant="default" gridColumn="1" flexShrink={0}>
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
      <Box gridColumn={["1", "1", "2"]} overflow="auto">
        <Box padding="space60">
          {sections.map((section) => (
            <Box key={section.id} display={active === section.id ? 'block' : 'none'}>
              {section.content}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

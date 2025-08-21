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
import {
  Disclosure,
  DisclosureContent,
  DisclosureHeading,
  useDisclosureState,
} from '@twilio-paste/core/disclosure';
import { Button } from '@twilio-paste/core/button';
import { MenuIcon } from '@twilio-paste/icons/esm/MenuIcon';

export default function DashboardLayout({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  const disclosure = useDisclosureState();

  const handleSelect = (id) => {
    setActive(id);
    if (disclosure.visible) {
      disclosure.hide();
    }
  };

  const sidebarNav = (
    <>
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
              onClick={() => handleSelect(section.id)}
            >
              {section.label}
            </SidebarNavigationItem>
          ))}
        </SidebarNavigation>
      </SidebarBody>
    </>
  );

  return (
    <Box
      display="flex"
      flexDirection={["column", "column", "row"]}
      minHeight="size100vh"
    >
      {/* Mobile Navigation */}
      <Box display={["block", "block", "none"]}>
        <Disclosure state={disclosure}>
          <DisclosureHeading
            as={Button}
            variant="secondary"
            size="icon"
            aria-label={disclosure.visible ? 'Hide navigation' : 'Show navigation'}
          >
            <MenuIcon decorative={false} title="Navigation menu" />
          </DisclosureHeading>
          <DisclosureContent
            position="absolute"
            top="0"
            left="0"
            width="100%"
            height="100vh"
            backgroundColor="colorBackgroundBody"
            zIndex="zIndex60"
          >
            <Sidebar variant="default" height="100%">
              {sidebarNav}
            </Sidebar>
          </DisclosureContent>
        </Disclosure>
      </Box>

      {/* Desktop Sidebar */}
      <Sidebar
        variant="default"
        display={["none", "none", "flex"]}
        width="240px"
        flexShrink={0}
        position="sticky"
        top="0"
        height="100vh"
      >
        {sidebarNav}
      </Sidebar>

      <Box as="main" flexGrow={1} overflow="auto" padding="space60">
        {sections.map((section) => (
          <Box key={section.id} display={active === section.id ? 'block' : 'none'}>
            {section.content}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

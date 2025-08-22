import { useState, useEffect } from 'react';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { CloseIcon } from '@twilio-paste/icons/esm/CloseIcon';
import ChatWidget from './ChatWidget.jsx';

export default function ChatPanel({
  sessions = [],
  onClose,
  onIncrementUnread,
  onClearUnread,
  onLabel,
}) {
  const [activeTab, setActiveTab] = useState(sessions[0]?.sid);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveTab(undefined);
    } else if (!sessions.some((s) => s.sid === activeTab)) {
      setActiveTab(sessions[0].sid);
    }
  }, [sessions, activeTab]);

  if (sessions.length === 0) return null;

  return (
    <Tabs
      selectedId={activeTab}
      onTabChange={(id) => {
        setActiveTab(id);
        onClearUnread?.(id);
      }}
    >
      <TabList aria-label="Active chats">
        {sessions.map((s) => (
          <Tab key={s.sid} id={s.sid}>
            <Box display="flex" alignItems="center" columnGap="space20">
              <Box as="span">{s.label}</Box>
              {s.unread > 0 && (
                <Badge as="span" variant="new">
                  {s.unread}
                </Badge>
              )}
              <Button
                size="reset"
                variant="link"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(s.sid);
                }}
              >
                <CloseIcon decorative />
              </Button>
            </Box>
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {sessions.map((s) => (
          <TabPanel key={s.sid} id={s.sid}>
            <ChatWidget
              conversationIdOrUniqueName={s.sid}
              isActive={activeTab === s.sid}
              onMessageAdded={() =>
                s.sid === activeTab
                  ? onClearUnread?.(s.sid)
                  : onIncrementUnread?.(s.sid)
              }
              onLabel={(label) => onLabel?.(s.sid, label)}
            />
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}

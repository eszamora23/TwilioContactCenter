import { useState, useEffect } from 'react';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { CloseIcon } from '@twilio-paste/icons/esm/CloseIcon';
import ChatWidget from './ChatWidget.jsx';

export default function ChatPanel({
  sessions = [],
  selectedSid,          // NEW: controlled selected chat
  onSelect,             // NEW: notify parent when user switches tab
  onClose,
  onIncrementUnread,
  onClearUnread,
  onLabel,
  onPopout,             // optional popout
}) {
  const [activeTab, setActiveTab] = useState(selectedSid || sessions[0]?.sid);

  // keep internal state in sync when parent changes selectedSid or sessions change
  useEffect(() => {
    if (!sessions.length) {
      setActiveTab(undefined);
      return;
    }
    if (selectedSid && sessions.some((s) => s.sid === selectedSid) && selectedSid !== activeTab) {
      setActiveTab(selectedSid);
      return;
    }
    if (!sessions.some((s) => s.sid === activeTab)) {
      setActiveTab(sessions[0].sid);
    }
  }, [sessions, selectedSid, activeTab]);

  if (sessions.length === 0) return null;

  return (
    <Tabs
      selectedId={activeTab}
      onTabChange={(id) => {
        setActiveTab(id);
        onClearUnread?.(id);
        onSelect?.(id);     // notify parent
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

              {typeof onPopout === 'function' && (
                <Button
                  size="reset"
                  variant="link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPopout?.(s.sid);
                  }}
                  title="Pop out"
                  aria-label="Pop out"
                >
                  ↗
                </Button>
              )}

              <Button
                size="reset"
                variant="link"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(s.sid);
                }}
                title="Close"
                aria-label="Close"
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
            {/* NEW: wrapper con altura acotada y minHeight:0 para habilitar scroll interno */}
            <Box height="clamp(420px, 65vh, 760px)" minHeight="0" display="flex">
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
            </Box>
          </TabPanel>
        ))}
      </TabPanels>

    </Tabs>
  );
}

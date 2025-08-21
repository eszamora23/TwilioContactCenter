// contact-center/client/src/components/Customer360.jsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Api from '../../index.js';

import { Box } from '@twilio-paste/core/box';
import { Card } from '@twilio-paste/core/card';
import { Heading } from '@twilio-paste/core/heading';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { Timeline, TimelineItem } from '@twilio-paste/core/timeline';
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@twilio-paste/core/modal';
import { Input } from '@twilio-paste/core/input';
import { Label } from '@twilio-paste/core/label';
import { Select, Option } from '@twilio-paste/core/select';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Spinner } from '@twilio-paste/core/spinner';
import { Toaster, useToaster } from '@twilio-paste/core/toast';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';

export default function Customer360({ selectedTask }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleType, setScheduleType] = useState('');
  const [paylinkStatus, setPaylinkStatus] = useState('idle');
  const [scheduleStatus, setScheduleStatus] = useState('idle');

  const toaster = useToaster();
  const queryClient = useQueryClient();

  /* ===================== Data ===================== */
  const { data: task } = useQuery({
    queryKey: ['myTask', selectedTask?.sid],
    queryFn: async () => {
      if (selectedTask) return selectedTask;
      const list = await Api.myTasks('assigned,reserved,wrapping');
      return (
        list.find((x) =>
          ['assigned', 'reserved'].includes(String(x.assignmentStatus).toLowerCase())
        ) || list[0] || null
      );
    },
    staleTime: 5000,
    refetchInterval: 5000,
    keepPreviousData: true,
  });

  const { data: customer } = useQuery({
    queryKey: ['crmCustomer', task?.attributes?.customerId],
    queryFn: () => Api.crmCustomer(task.attributes.customerId),
    enabled: !!task?.attributes?.customerId,
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: vehicle } = useQuery({
    queryKey: ['crmVehicle', task?.attributes?.vehicleId || task?.attributes?.vin || task?.attributes?.plate],
    queryFn: () => {
      if (task.attributes.vehicleId) return Api.crmVehicleById(task.attributes.vehicleId);
      if (task.attributes.vin) return Api.crmVehicleByVin(task.attributes.vin);
      if (task.attributes.plate) return Api.crmVehicleByPlate(task.attributes.plate);
      return null;
    },
    enabled: !!(task?.attributes?.vehicleId || task?.attributes?.vin || task?.attributes?.plate),
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: appts = [] } = useQuery({
    queryKey: ['crmAppointments', task?.attributes?.vehicleId],
    queryFn: () => Api.crmAppointments(task.attributes.vehicleId),
    enabled: !!task?.attributes?.vehicleId,
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: finance } = useQuery({
    queryKey: ['crmFinance', task?.attributes?.customerId, !!task?.attributes?.otpVerified],
    queryFn: () => Api.crmFinance(task.attributes.customerId, !!task.attributes.otpVerified),
    enabled: !!task?.attributes?.customerId,
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['crmInteractions', task?.attributes?.customerId],
    queryFn: () => Api.crmInteractions(task.attributes.customerId),
    enabled: !!task?.attributes?.customerId,
    staleTime: 30000,
    keepPreviousData: true,
  });

  const title = useMemo(() => {
    if (!customer && !vehicle) return t('customer360');
    return `${customer?.name || t('customer')} ${customer?.tier ? `· ${customer.tier}` : ''}`;
  }, [customer, vehicle, t]);

  /* ===================== Actions ===================== */
  async function sendPaylink() {
    if (!customer?._id) return;
    try {
      setPaylinkStatus('loading');
      await Api.crmPaylink(customer._id);
      setPaylinkStatus('success');
      toaster.push({ message: t('payLinkSent'), variant: 'success' });
    } catch (e) {
      setPaylinkStatus('error');
      setError(t('payLinkError'));
    }
  }

  async function scheduleAppointment() {
    if (!task?.attributes?.vehicleId || !scheduleDate || !scheduleType) {
      setScheduleStatus('error');
      setError(t('scheduleMissingFields'));
      return;
    }
    try {
      setError('');
      setScheduleStatus('loading');
      await Api.crmCreateAppointment({
        vehicleId: task.attributes.vehicleId,
        datetime: scheduleDate,
        serviceType: scheduleType,
      });
      setIsScheduleOpen(false);
      setScheduleStatus('success');
      toaster.push({ message: t('scheduleSuccess'), variant: 'success' });
      await queryClient.invalidateQueries(['crmAppointments', task.attributes.vehicleId]);
    } catch (e) {
      setScheduleStatus('error');
      setError(t('scheduleError'));
    }
  }

  /* ===================== Empty / Loading ===================== */
  if (!task) {
    return (
      <Card padding="space70">
        <Heading as="h3" variant="heading30">
          {t('customer360')}
        </Heading>
        <Box color="colorTextWeak">{t('noActiveTask')}</Box>
      </Card>
    );
  }

  /* ===================== Layout (uniforme y claro) ===================== */
  return (
    <Card padding="space70" display="flex" flexDirection="column" height="100%" minHeight="0">
      <Toaster {...toaster} />
      {error ? (
        <Box marginBottom="space60">
          <Alert variant="error">{error}</Alert>
        </Box>
      ) : null}

      {/* Header compacto y claro */}
      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        distribution="spaceBetween"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Heading as="h3" variant="heading30" margin="space0">
            {title}
          </Heading>
          {customer?.tier ? <Badge as="span" variant="new">{customer.tier}</Badge> : null}
        </Stack>

        {/* Acciones principales */}
        <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={() => { setScheduleStatus('idle'); setIsScheduleOpen(true); }}
            disabled={scheduleStatus === 'loading'}
          >
            {scheduleStatus === 'loading' ? (
              <Spinner size="sizeIcon20" decorative={false} title={t('loading')} />
            ) : t('scheduleNewAppointment')}
          </Button>
          <Button
            variant="secondary"
            onClick={sendPaylink}
            disabled={paylinkStatus === 'loading'}
          >
            {paylinkStatus === 'loading' ? (
              <Spinner size="sizeIcon20" decorative={false} title={t('loading')} />
            ) : t('sendPayLink')}
          </Button>
        </Stack>
      </Stack>

      {/* Meta bar */}
      <Box
        marginTop="space50"
        padding="space50"
        backgroundColor="colorBackgroundBody"
        borderRadius="borderRadius20"
      >
        <Stack
          orientation={['vertical', 'horizontal']}
          spacing="space60"
          style={{ flexWrap: 'wrap' }}
        >
          <Box>
            <Box color="colorTextWeak" fontSize="fontSize30">{t('intent')}</Box>
            <Box fontWeight="fontWeightSemibold">{task.attributes?.intent || '—'}</Box>
          </Box>
          <Box>
            <Box color="colorTextWeak" fontSize="fontSize30">{t('ivrPath')}</Box>
            <Box fontWeight="fontWeightSemibold">{task.attributes?.ivr_path || '—'}</Box>
          </Box>
          <Box>
            <Box color="colorTextWeak" fontSize="fontSize30">{t('vehicle')}</Box>
            <Box fontWeight="fontWeightSemibold">
              {vehicle ? `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`.trim() : '—'}
            </Box>
          </Box>
        </Stack>
      </Box>

      {/* Tabs: contenido con altura consistente */}
      <Box marginTop="space70" flexGrow={1} minHeight="0" display="flex" flexDirection="column">
        <Tabs baseId="customer-tabs">
          <Box overflowX="auto">
            <TabList aria-label={t('customerTabsAria')}>
              <Tab>{t('vehicle')}</Tab>
              <Tab>{t('appointments')}</Tab>
              <Tab>{t('finance')}</Tab>
              <Tab>{t('history')}</Tab>
            </TabList>
          </Box>

          <Box flexGrow={1} minHeight="0" overflow="auto">
            <TabPanels>
              {/* ===== Vehicle ===== */}
              <TabPanel>
                {vehicle ? (
                  <Stack orientation={['vertical', 'horizontal']} spacing="space80">
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('vehicle')}</Box>
                      <Box fontWeight="fontWeightSemibold">
                        {vehicle.year || '—'} {vehicle.make || ''} {vehicle.model || ''}
                      </Box>
                    </Box>
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('vin')}</Box>
                      <Box fontWeight="fontWeightSemibold">{vehicle.vin || '—'}</Box>
                    </Box>
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('plate')}</Box>
                      <Box fontWeight="fontWeightSemibold">{vehicle.plate || '—'}</Box>
                    </Box>
                  </Stack>
                ) : (
                  <Box color="colorTextWeak">{t('noVehicle')}</Box>
                )}
              </TabPanel>

              {/* ===== Appointments ===== */}
              <TabPanel>
                {appts?.length ? (
                  <Table scrollHorizontally>
                    <THead>
                      <Tr>
                        <Th>{t('date')}</Th>
                        <Th>{t('serviceType')}</Th>
                        <Th>{t('status')}</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {appts.map((a) => (
                        <Tr key={a._id}>
                          <Td>{new Date(a.datetime).toLocaleString()}</Td>
                          <Td>{a.serviceType || t('service')}</Td>
                          <Td>{a.status}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <Box color="colorTextWeak">{t('noAppointments')}</Box>
                )}
                {/* Feedback visual de acciones */}
                <Box marginTop="space40">
                  {scheduleStatus === 'success' ? (
                    <Badge as="span" variant="success">{t('scheduleSuccess')}</Badge>
                  ) : null}
                  {scheduleStatus === 'error' ? (
                    <Badge as="span" variant="error" marginLeft="space40">{error}</Badge>
                  ) : null}
                </Box>
              </TabPanel>

              {/* ===== Finance ===== */}
              <TabPanel>
                {finance ? (
                  <Stack orientation={['vertical', 'horizontal']} spacing="space80">
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('balance')}</Box>
                      <Box fontWeight="fontWeightSemibold">
                        {typeof finance.balance === 'number' ? finance.balance : t('masked')}
                      </Box>
                    </Box>
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('payoffDate')}</Box>
                      <Box fontWeight="fontWeightSemibold">{finance.payoffDate || '—'}</Box>
                    </Box>
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('loyaltyCashback')}</Box>
                      <Box fontWeight="fontWeightSemibold">
                        {finance.loyaltyCashback ?? '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box color="colorTextWeak" fontSize="fontSize30">{t('lastPayment')}</Box>
                      <Box fontWeight="fontWeightSemibold">{finance.lastPayment || '—'}</Box>
                    </Box>
                  </Stack>
                ) : (
                  <Box color="colorTextWeak">{t('noFinance')}</Box>
                )}
                <Box marginTop="space40">
                  {paylinkStatus === 'success' ? (
                    <Badge as="span" variant="success">{t('payLinkSent')}</Badge>
                  ) : null}
                  {paylinkStatus === 'error' ? (
                    <Badge as="span" variant="error" marginLeft="space40">{t('payLinkError')}</Badge>
                  ) : null}
                </Box>
              </TabPanel>

              {/* ===== History ===== */}
              <TabPanel>
                {interactions?.length ? (
                  <Timeline>
                    {interactions.map((inter, idx) => (
                      <TimelineItem key={idx}>
                        {new Date(inter.createdAt).toLocaleString()}: {inter.intent} — {inter.disposition}
                      </TimelineItem>
                    ))}
                  </Timeline>
                ) : (
                  <Box color="colorTextWeak">{t('noInteractions')}</Box>
                )}
              </TabPanel>
            </TabPanels>
          </Box>
        </Tabs>
      </Box>

      {/* Modal: schedule */}
      <Modal isOpen={isScheduleOpen} onDismiss={() => setIsScheduleOpen(false)} size="default">
        <ModalHeader>
          <ModalHeading>{t('scheduleAppointment')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space60">
            <Box>
              <Label htmlFor="date">{t('date')}</Label>
              <Input
                id="date"
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </Box>
            <Box>
              <Label htmlFor="type">{t('serviceType')}</Label>
              <Select
                id="type"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
              >
                <Option value="">{t('selectType')}</Option>
                <Option value="maintenance">Maintenance</Option>
                <Option value="recall">Recall</Option>
              </Select>
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsScheduleOpen(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={scheduleAppointment}>
            {t('schedule')}
          </Button>
        </ModalFooter>
      </Modal>
    </Card>
  );
}

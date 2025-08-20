// contact-center/client/src/components/Customer360.jsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Api from '../api.js';
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
import { useQuery } from '@tanstack/react-query';

export default function Customer360({ selectedTask }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleType, setScheduleType] = useState('');

  const { data: task } = useQuery({
    queryKey: ['myTask', selectedTask?.sid],
    queryFn: async () => {
      if (selectedTask) return selectedTask;
      const list = await Api.myTasks('assigned,reserved,wrapping');
      return list.find(x => ['assigned', 'reserved'].includes(String(x.assignmentStatus).toLowerCase())) || list[0] || null;
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

  async function sendPaylink() {
    if (!customer?._id) return;
    try {
      await Api.crmPaylink(customer._id);
      alert(t('payLinkSent'));
    } catch (e) {
      setError(t('payLinkError'));
    }
  }

  async function scheduleAppointment() {
    if (!task?.attributes?.vehicleId || !scheduleDate || !scheduleType) {
      setError(t('scheduleMissingFields'));
      return;
    }
    try {
      setError('');
      await Api.crmCreateAppointment({
        vehicleId: task.attributes.vehicleId,
        datetime: scheduleDate,
        serviceType: scheduleType,
      });
      setIsScheduleOpen(false);
      // Refresh appts
      const newAppts = await Api.crmAppointments(task.attributes.vehicleId);
      setAppts(newAppts);
    } catch (e) {
      setError(t('scheduleError'));
    }
  }

  if (!task) {
    return (
      <Card padding="space70">
        <Heading as="h3" variant="heading30">{t('customer360')}</Heading>
        <Box color="colorTextWeak">{t('noActiveTask')}</Box>
      </Card>
    );
  }

  return (
    <Card padding="space70">
      {error && <Alert variant="error">{error}</Alert>}
      <Stack orientation="vertical" spacing="space50">
        <Stack orientation={['vertical', 'horizontal']} spacing="space40" alignment="center">
          <Heading as="h3" variant="heading30" margin="space0">{title}</Heading>
          {customer?.tier ? <Badge as="span" variant="new">{customer.tier}</Badge> : null}
        </Stack>

        <Box>
          <b>{t('intent')}:</b> {task.attributes?.intent || '—'}<br/>
          <b>{t('ivrPath')}:</b> {task.attributes?.ivr_path || '—'}
        </Box>

        <Tabs baseId="customer-tabs">
          <TabList aria-label={t('customerTabsAria')}>
            <Tab>{t('vehicle')}</Tab>
            <Tab>{t('appointments')}</Tab>
            <Tab>{t('finance')}</Tab>
            <Tab>{t('history')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              {vehicle ? (
                <Box>
                  <b>{t('vehicle')}:</b> {vehicle.year || '—'} {vehicle.make || ''} {vehicle.model || ''} <br/>
                  <b>{t('vin')}:</b> {vehicle.vin || '—'} &nbsp;&nbsp; <b>{t('plate')}:</b> {vehicle.plate || '—'}
                </Box>
              ) : t('noVehicle')}
            </TabPanel>
            <TabPanel>
              {!!appts?.length ? (
                <Box>
                  <b>{t('appointments')}:</b>
                  <ul>
                    {appts.map(a => (
                      <li key={a._id}>{new Date(a.datetime).toLocaleString()} — {a.serviceType || t('service')} ({a.status})</li>
                    ))}
                  </ul>
                </Box>
              ) : t('noAppointments')}
              <Button variant="secondary" onClick={() => setIsScheduleOpen(true)}>{t('scheduleNewAppointment')}</Button>
            </TabPanel>
            <TabPanel>
              {finance ? (
                <Box>
                  <b>{t('finance')}:</b><br/>
                  {t('balance')}: {typeof finance.balance === 'number' ? finance.balance : t('masked')}<br/>
                  {t('payoffDate')}: {finance.payoffDate || '—'}<br/>
                  {t('loyaltyCashback')}: {finance.loyaltyCashback ?? '—'}<br/>
                  {t('lastPayment')}: {finance.lastPayment || '—'}<br/>
                  <Button variant="secondary" onClick={sendPaylink} style={{marginTop: 8}}>{t('sendPayLink')}</Button>
                </Box>
              ) : t('noFinance')}
            </TabPanel>
            <TabPanel>
              {!!interactions?.length ? (
                <Timeline>
                  {interactions.map((inter, idx) => (
                    <TimelineItem key={idx}>
                      {new Date(inter.createdAt).toLocaleString()}: {inter.intent} - {inter.disposition}
                    </TimelineItem>
                  ))}
                </Timeline>
              ) : t('noInteractions')}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Stack>

      <Modal isOpen={isScheduleOpen} onDismiss={() => setIsScheduleOpen(false)} size="default">
        <ModalHeader>
          <ModalHeading>{t('scheduleAppointment')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space60">
            <Box>
              <Label htmlFor="date">{t('date')}</Label>
              <Input id="date" type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </Box>
            <Box>
              <Label htmlFor="type">{t('serviceType')}</Label>
              <Select id="type" value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
                <Option value="">{t('selectType')}</Option>
                <Option value="maintenance">Maintenance</Option>
                <Option value="recall">Recall</Option>
              </Select>
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsScheduleOpen(false)}>{t('cancel')}</Button>
          <Button variant="primary" onClick={scheduleAppointment}>{t('schedule')}</Button>
        </ModalFooter>
      </Modal>
    </Card>
  );
}
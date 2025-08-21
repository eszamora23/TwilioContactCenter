// contact-center/server/src/routes/crm.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import { crm } from '../lib/crmClient.js';

export const crmProxy = Router();
crmProxy.use(requireAuth);

// --- NEW: fetch full vehicle by internal id (for better 360 details) ---
crmProxy.get('/crm/vehicles/by-id/:id', async (req, res) => {
  try { res.json(await crm.vehicleById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.get('/crm/customers/:id', async (req, res) => {
  try { res.json(await crm.customerById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

// IMPORTANT: place "by-plate" before ":vin" to avoid route shadowing
crmProxy.get('/crm/vehicles/by-plate/:plate', async (req, res) => {
  try { res.json(await crm.vehicleByPlate(req.params.plate)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.get('/crm/vehicles/:vin', async (req, res) => {
  try { res.json(await crm.vehicleByVin(req.params.vin)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.get('/crm/appointments/:vehicleId', async (req, res) => {
  try { res.json(await crm.appointments(req.params.vehicleId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.post('/crm/appointments', async (req, res) => {
  try { res.json(await crm.createAppointment(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.get('/crm/finance/:customerId', async (req, res) => {
  try {
    const otpVerified = String(req.query.otpVerified || 'false') === 'true';
    res.json(await crm.finance(req.params.customerId, otpVerified));
  } catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.post('/crm/paylink', async (req, res) => {
  try { res.json(await crm.payLink(req.body.customerId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

crmProxy.post('/crm/interactions', async (req, res) => {
  try { res.json(await crm.logInteraction(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
});

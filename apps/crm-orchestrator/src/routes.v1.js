// contact-center/crm-orchestrator/src/routes.v1.js
import { Router } from 'express';
import { requireServiceAuth } from '@shared/auth';
import { collections } from './db.js';
import { ObjectId } from 'mongodb';

export const v1 = Router();

// All routes require internal service auth
v1.use(requireServiceAuth);

/** Helpers */
const maskFinance = (f) =>
  !f
    ? null
    : {
        balance: '****',
        payoffDate: f.payoffDate,
        loyaltyCashback: f.loyaltyCashback,
        lastPayment: '****', // Mask additional field
      };

const col = () => collections();

/** Customers */
v1.get('/customers/by-ani/:ani', async (req, res) => {
  try {
    const ani = req.params.ani.replace(/\D/g, '');
    const c = await col().customers.findOne({ phones: ani });
    return res.json(c || null);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.get('/customers/:id', async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const c = await col().customers.findOne({ _id });
    return res.json(c || null);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

/** Vehicles */
// NEW: fetch vehicle by internal id
v1.get('/vehicles/:id', async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const v = await col().vehicles.findOne({ _id });
    return res.json(v || null);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.get('/vehicles/by-vin/:vin', async (req, res) => {
  try {
    const v = await col().vehicles.findOne({ vin: req.params.vin.toUpperCase() });
    return res.json(v || null);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.get('/vehicles/by-plate/:plate', async (req, res) => {
  try {
    const v = await col().vehicles.findOne({ plate: req.params.plate.toUpperCase() });
    return res.json(v || null);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

/** Appointments */
v1.get('/appointments/:vehicleId', async (req, res) => {
  try {
    const appts = await col()
      .appointments.find({ vehicleId: req.params.vehicleId })
      .sort({ datetime: -1 })
      .limit(10)
      .toArray();
    return res.json(appts || []);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.post('/appointments', async (req, res) => {
  try {
    const { vehicleId, datetime, serviceType, notes } = req.body || {};
    if (!vehicleId || !datetime) return res.status(400).json({ error: 'missing fields' });

    const doc = {
      vehicleId,
      serviceType: serviceType || 'service',
      datetime: new Date(datetime),
      status: 'scheduled',
      advisorId: undefined,
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await col().appointments.insertOne(doc);
    return res.json(doc);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

/** Recalls */
v1.get('/recalls/:vin', async (req, res) => {
  try {
    const list = await col()
      .recalls.find({ vin: req.params.vin.toUpperCase(), status: 'open' })
      .toArray();
    return res.json(list || []);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

/** Finance */
v1.get('/finance/:customerId', async (req, res) => {
  try {
    const f = await col().finance.findOne({ customerId: req.params.customerId });
    const otpVerified = String(req.query.otpVerified || 'false') === 'true';
    return res.json(otpVerified ? f : maskFinance(f));
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.post('/paylink', async (req, res) => {
  try {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    // For demo: generate a fake pay link and pretend we sent an SMS
    const url = `https://pay.demo.example/${customerId}/${Date.now()}`;
    return res.json({ ok: true, url });
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

/** Interactions */
v1.post('/interactions', async (req, res) => {
  try {
    const doc = { ...(req.body || {}), createdAt: new Date(), updatedAt: new Date() };
    const r = await col().interactions.insertOne(doc);
    return res.json({ ok: true, id: r.insertedId });
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});

v1.get('/interactions/:customerId', async (req, res) => {
  try {
    const list = await col()
      .interactions.find({ customerId: req.params.customerId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    return res.json(list || []);
  } catch (e) {
    return res.status(500).json({ error: 'db error' });
  }
});
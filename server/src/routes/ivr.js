import { Router } from 'express';
import { crm } from '../lib/crmClient.js';

export const ivr = Router();

/**
 * Each IVR endpoint returns compact JSON usable by Studio:
 *  - data payload for logic
 *  - optional 'say' string if you want TTS quickly
 */

 ivr.post('/ivr/lookup', async (req, res) => {
  try {
    const { From, plate, vin } = req.body || {};
    let customer = null, vehicle = null;

    // 1) Intento directo por VIN/PLATE si viene del Flow
    if (vin) {
      vehicle = await crm.vehicleByVin(String(vin).toUpperCase());
    } else if (plate) {
      vehicle = await crm.vehicleByPlate(String(plate).toUpperCase());
    }

    // 2) Si no hay vehículo, intenta por ANI (llamante)
    if (!vehicle && From) {
      customer = await crm.customerByAni(String(From).replace(/\D/g, ''));
      // 2.1) Si hay cliente y tiene defaultVehicleId, cárgalo
      if (customer?.defaultVehicleId) {
        try {
          // Nota: agregamos vehicleById en crmClient y route proxy
          vehicle = await crm.vehicleById(customer.defaultVehicleId);
        } catch { /* noop */ }
      }
    }

    // 3) Si encontramos vehículo pero aún no tenemos cliente, súbelo del owner
    if (vehicle && !customer && vehicle?.customerId) {
      customer = await crm.customerById(vehicle.customerId);
    }

    // 4) Respuesta compacta para Studio
    res.json({
      customerId: customer?._id || null,
      name: customer?.name || null,
      vehicleId: vehicle?._id || null,
      vin: vehicle?.vin || null,
      plate: vehicle?.plate || null,
      tier: customer?.tier || 'Standard'
    });
  } catch (e) {
    res.status(500).json({ error: 'lookup failed' });
  }
});


ivr.post('/ivr/service/status', async (req, res) => {
  try {
    const { vehicleId } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });
    const appts = await crm.appointments(vehicleId);
    const last = appts?.[0] || null;
    const say = last
      ? `Your last appointment is ${new Date(last.datetime).toLocaleString()}. Status: ${last.status}.`
      : `No recent appointments found.`;
    res.json({ appointment: last, say });
  } catch {
    res.status(500).json({ error: 'status failed' });
  }
});

ivr.post('/ivr/service/schedule', async (req, res) => {
  try {
    const { vehicleId, preferDate, serviceType } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });

    // Demo: accept preferDate or pick now+2days @ 10:30
    const dt = preferDate ? new Date(preferDate) :
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    dt.setHours(10, 30, 0, 0);

    const appt = await crm.createAppointment({ vehicleId, datetime: dt, serviceType: serviceType || 'maintenance' });
    res.json({ appointment: appt, say: `Your appointment is set for ${dt.toLocaleString()}.` });
  } catch {
    res.status(500).json({ error: 'schedule failed' });
  }
});

ivr.post('/ivr/recalls/check', async (req, res) => {
  try {
    const { vin } = req.body || {};
    if (!vin) return res.status(400).json({ error: 'missing vin' });
    const list = await crm.recallsByVin(String(vin).toUpperCase());
    const say = !list.length
      ? 'There are no open recalls for your vehicle.'
      : `We found ${list.length} open recall${list.length>1?'s':''}.`;
    res.json({ recalls: list, say });
  } catch {
    res.status(500).json({ error: 'recalls failed' });
  }
});

ivr.post('/ivr/finance/balance', async (req, res) => {
  try {
    const { customerId, otpCode } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });

    // Demo OTP rule: accept any 4+ digits
    const otpVerified = !!String(otpCode || '').match(/^\d{4,}$/);
    const f = await crm.finance(customerId, otpVerified);

    const say = otpVerified
      ? `Your balance is ${typeof f.balance === 'number' ? f.balance : 'not available'}.`
      : `Verification required to reveal the balance.`;

    res.json({ finance: f, otpVerified, say });
  } catch {
    res.status(500).json({ error: 'finance failed' });
  }
});

ivr.post('/ivr/finance/paylink', async (req, res) => {
  try {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    const r = await crm.payLink(customerId);
    // (Optional) Send SMS from here if desired using Twilio Messaging
    res.json({ ok: true, url: r.url });
  } catch {
    res.status(500).json({ error: 'paylink failed' });
  }
});

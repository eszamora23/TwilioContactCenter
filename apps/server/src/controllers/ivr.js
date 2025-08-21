import * as ivrService from '../services/ivr.js';

export async function lookup(req, res) {
  try {
    const { From, plate, vin } = req.body || {};
    const data = await ivrService.lookup({ From, plate, vin });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'lookup failed' });
  }
}

export async function serviceStatus(req, res) {
  try {
    const { vehicleId } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });
    res.json(await ivrService.serviceStatus(vehicleId));
  } catch {
    res.status(500).json({ error: 'status failed' });
  }
}

export async function serviceSchedule(req, res) {
  try {
    const { vehicleId, preferDate, serviceType } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });
    res.json(await ivrService.schedule({ vehicleId, preferDate, serviceType }));
  } catch {
    res.status(500).json({ error: 'schedule failed' });
  }
}

export async function recallsCheck(req, res) {
  try {
    const { vin } = req.body || {};
    if (!vin) return res.status(400).json({ error: 'missing vin' });
    res.json(await ivrService.recallsCheck(vin));
  } catch {
    res.status(500).json({ error: 'recalls failed' });
  }
}

export async function financeBalance(req, res) {
  try {
    const { customerId, otpCode } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    res.json(await ivrService.financeBalance({ customerId, otpCode }));
  } catch {
    res.status(500).json({ error: 'finance failed' });
  }
}

export async function financePaylink(req, res) {
  try {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    res.json(await ivrService.financePaylink(customerId));
  } catch {
    res.status(500).json({ error: 'paylink failed' });
  }
}

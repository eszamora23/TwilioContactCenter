import * as crmService from '../services/crm.js';

export async function getVehicleById(req, res) {
  try { res.json(await crmService.vehicleById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getCustomerById(req, res) {
  try { res.json(await crmService.customerById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getVehicleByPlate(req, res) {
  try { res.json(await crmService.vehicleByPlate(req.params.plate)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getVehicleByVin(req, res) {
  try { res.json(await crmService.vehicleByVin(req.params.vin)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getAppointments(req, res) {
  try { res.json(await crmService.appointments(req.params.vehicleId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function createAppointment(req, res) {
  try { res.json(await crmService.createAppointment(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getFinance(req, res) {
  try {
    const otpVerified = String(req.query.otpVerified || 'false') === 'true';
    res.json(await crmService.finance(req.params.customerId, otpVerified));
  } catch {
    res.status(500).json({ error: 'crm error' });
  }
}

export async function payLink(req, res) {
  try { res.json(await crmService.payLink(req.body.customerId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function logInteraction(req, res) {
  try { res.json(await crmService.logInteraction(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

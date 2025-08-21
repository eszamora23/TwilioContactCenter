import {
  vehicleById,
  customerById,
  vehicleByPlate,
  vehicleByVin,
  appointments,
  createAppointment,
  finance,
  payLink,
  logInteraction
} from '../services/crm.js';

export async function getVehicleById(req, res) {
  try { res.json(await vehicleById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getCustomerById(req, res) {
  try { res.json(await customerById(req.params.id)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getVehicleByPlate(req, res) {
  try { res.json(await vehicleByPlate(req.params.plate)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getVehicleByVin(req, res) {
  try { res.json(await vehicleByVin(req.params.vin)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getAppointments(req, res) {
  try { res.json(await appointments(req.params.vehicleId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function postAppointment(req, res) {
  try { res.json(await createAppointment(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function getFinance(req, res) {
  try {
    const otpVerified = String(req.query.otpVerified || 'false') === 'true';
    res.json(await finance(req.params.customerId, otpVerified));
  } catch { res.status(500).json({ error: 'crm error' }); }
}

export async function postPayLink(req, res) {
  try { res.json(await payLink(req.body.customerId)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

export async function postInteraction(req, res) {
  try { res.json(await logInteraction(req.body)); }
  catch { res.status(500).json({ error: 'crm error' }); }
}

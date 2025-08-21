import {
  findVehicleByVin,
  findVehicleByPlate,
  findCustomerByAni,
  findVehicleById,
  findCustomerById,
  getAppointments,
  createAppointment,
  getRecallsByVin,
  getFinance,
  createPayLink
} from '../services/ivr.js';

export async function lookup(req, res) {
  try {
    const { From, plate, vin } = req.body || {};
    let customer = null, vehicle = null;

    if (vin) {
      vehicle = await findVehicleByVin(vin);
    } else if (plate) {
      vehicle = await findVehicleByPlate(plate);
    }

    if (!vehicle && From) {
      customer = await findCustomerByAni(From);
      if (customer?.defaultVehicleId) {
        try {
          vehicle = await findVehicleById(customer.defaultVehicleId);
        } catch {}
      }
    }

    if (vehicle && !customer && vehicle?.customerId) {
      customer = await findCustomerById(vehicle.customerId);
    }

    res.json({
      customerId: customer?._id || null,
      name: customer?.name || null,
      vehicleId: vehicle?._id || null,
      vin: vehicle?.vin || null,
      plate: vehicle?.plate || null,
      tier: customer?.tier || 'Standard'
    });
  } catch {
    res.status(500).json({ error: 'lookup failed' });
  }
}

export async function serviceStatus(req, res) {
  try {
    const { vehicleId } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });
    const appts = await getAppointments(vehicleId);
    const last = appts?.[0] || null;
    const say = last
      ? `Your last appointment is ${new Date(last.datetime).toLocaleString()}. Status: ${last.status}.`
      : `No recent appointments found.`;
    res.json({ appointment: last, say });
  } catch {
    res.status(500).json({ error: 'status failed' });
  }
}

export async function scheduleService(req, res) {
  try {
    const { vehicleId, preferDate, serviceType } = req.body || {};
    if (!vehicleId) return res.status(400).json({ error: 'missing vehicleId' });
    const dt = preferDate ? new Date(preferDate) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    dt.setHours(10, 30, 0, 0);
    const appt = await createAppointment({ vehicleId, datetime: dt, serviceType: serviceType || 'maintenance' });
    res.json({ appointment: appt, say: `Your appointment is set for ${dt.toLocaleString()}.` });
  } catch {
    res.status(500).json({ error: 'schedule failed' });
  }
}

export async function checkRecalls(req, res) {
  try {
    const { vin } = req.body || {};
    if (!vin) return res.status(400).json({ error: 'missing vin' });
    const list = await getRecallsByVin(vin);
    const say = !list.length
      ? 'There are no open recalls for your vehicle.'
      : `We found ${list.length} open recall${list.length>1?'s':''}.`;
    res.json({ recalls: list, say });
  } catch {
    res.status(500).json({ error: 'recalls failed' });
  }
}

export async function financeBalance(req, res) {
  try {
    const { customerId, otpCode } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    const otpVerified = !!String(otpCode || '').match(/^\d{4,}$/);
    const f = await getFinance(customerId, otpVerified);
    const say = otpVerified
      ? `Your balance is ${typeof f.balance === 'number' ? f.balance : 'not available'}.`
      : `Verification required to reveal the balance.`;
    res.json({ finance: f, otpVerified, say });
  } catch {
    res.status(500).json({ error: 'finance failed' });
  }
}

export async function financePaylink(req, res) {
  try {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'missing customerId' });
    const r = await createPayLink(customerId);
    res.json({ ok: true, url: r.url });
  } catch {
    res.status(500).json({ error: 'paylink failed' });
  }
}

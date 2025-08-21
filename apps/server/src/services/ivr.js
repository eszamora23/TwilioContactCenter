import * as crm from './crm.js';

export async function lookup({ From, plate, vin }) {
  let customer = null, vehicle = null;
  if (vin) {
    vehicle = await crm.vehicleByVin(vin);
  } else if (plate) {
    vehicle = await crm.vehicleByPlate(plate);
  }
  if (!vehicle && From) {
    customer = await crm.customerByAni(From);
    if (customer?.defaultVehicleId) {
      try { vehicle = await crm.vehicleById(customer.defaultVehicleId); } catch {}
    }
  }
  if (vehicle && !customer && vehicle?.customerId) {
    customer = await crm.customerById(vehicle.customerId);
  }
  return {
    customerId: customer?._id || null,
    name: customer?.name || null,
    vehicleId: vehicle?._id || null,
    vin: vehicle?.vin || null,
    plate: vehicle?.plate || null,
    tier: customer?.tier || 'Standard'
  };
}

export async function serviceStatus(vehicleId) {
  const appts = await crm.appointments(vehicleId);
  const last = appts?.[0] || null;
  const say = last
    ? `Your last appointment is ${new Date(last.datetime).toLocaleString()}. Status: ${last.status}.`
    : `No recent appointments found.`;
  return { appointment: last, say };
}

export async function schedule({ vehicleId, preferDate, serviceType }) {
  const dt = preferDate ? new Date(preferDate) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  dt.setHours(10, 30, 0, 0);
  const appt = await crm.createAppointment({ vehicleId, datetime: dt, serviceType: serviceType || 'maintenance' });
  return { appointment: appt, say: `Your appointment is set for ${dt.toLocaleString()}.` };
}

export async function recallsCheck(vin) {
  const list = await crm.recallsByVin(vin);
  const say = !list.length
    ? 'There are no open recalls for your vehicle.'
    : `We found ${list.length} open recall${list.length>1?'s':''}.`;
  return { recalls: list, say };
}

export async function financeBalance({ customerId, otpCode }) {
  const otpVerified = !!String(otpCode || '').match(/^\d{4,}$/);
  const f = await crm.finance(customerId, otpVerified);
  const say = otpVerified
    ? `Your balance is ${typeof f.balance === 'number' ? f.balance : 'not available'}.`
    : `Verification required to reveal the balance.`;
  return { finance: f, otpVerified, say };
}

export async function financePaylink(customerId) {
  const r = await crm.payLink(customerId);
  return { ok: true, url: r.url };
}

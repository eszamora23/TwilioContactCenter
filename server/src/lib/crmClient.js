// contact-center/server/src/lib/crmClient.js
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

async function doFetch(path, { method = 'GET', body, qs } = {}) {
  const url = new URL(env.crmOrchBaseUrl.replace(/\/+$/, '') + path);
  if (qs) Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));

  const token = jwt.sign(
    { aud: env.crmOrchAudience, iss: env.crmOrchIssuer },
    env.crmOrchKey,
    { expiresIn: '60s' }
  );

  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`CRM ${res.status}: ${txt || res.statusText}`);
  }
  return res.json();
}

export const crm = {
  // NEW
  vehicleById: id => doFetch(`/v1/vehicles/${encodeURIComponent(id)}`),

  customerByAni: ani => doFetch(`/v1/customers/by-ani/${encodeURIComponent(ani)}`),
  customerById: id => doFetch(`/v1/customers/${encodeURIComponent(id)}`),
  vehicleByVin: vin => doFetch(`/v1/vehicles/by-vin/${encodeURIComponent(vin)}`),
  vehicleByPlate: plate => doFetch(`/v1/vehicles/by-plate/${encodeURIComponent(plate)}`),
  appointments: vehicleId => doFetch(`/v1/appointments/${encodeURIComponent(vehicleId)}`),
  createAppointment: payload => doFetch(`/v1/appointments`, { method: 'POST', body: payload }),
  recallsByVin: vin => doFetch(`/v1/recalls/${encodeURIComponent(vin)}`),
  finance: (customerId, otpVerified = false) =>
    doFetch(`/v1/finance/${encodeURIComponent(customerId)}`, { qs: { otpVerified: String(otpVerified) } }),
  payLink: customerId => doFetch(`/v1/paylink`, { method: 'POST', body: { customerId } }),
  logInteraction: payload => doFetch(`/v1/interactions`, { method: 'POST', body: payload })
};

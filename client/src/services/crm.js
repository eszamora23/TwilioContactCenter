import api from './http.js';

export const vehicleById = (id) =>
  api.get(`/crm/vehicles/by-id/${id}`).then(r => r.data);

export const customer = (id) =>
  api.get(`/crm/customers/${id}`).then(r => r.data);

export const vehicleByVin = (vin) =>
  api.get(`/crm/vehicles/${vin}`).then(r => r.data);

export const vehicleByPlate = (plate) =>
  api.get(`/crm/vehicles/by-plate/${plate}`).then(r => r.data);

export const appointments = (vehicleId) =>
  api.get(`/crm/appointments/${vehicleId}`).then(r => r.data);

export const createAppointment = (payload) =>
  api.post(`/crm/appointments`, payload).then(r => r.data);

export const finance = (customerId, otpVerified = false) =>
  api.get(`/crm/finance/${customerId}`, { params: { otpVerified } }).then(r => r.data);

export const paylink = (customerId) =>
  api.post(`/crm/paylink`, { customerId }).then(r => r.data);

export const logInteraction = (payload) =>
  api.post(`/crm/interactions`, payload).then(r => r.data);

export const interactions = (customerId) =>
  api.get(`/crm/interactions/${customerId}`).then(r => r.data);

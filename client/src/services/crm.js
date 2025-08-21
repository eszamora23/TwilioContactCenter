import api from './http.js';

export const crmVehicleById = (id) =>
  api.get(`/crm/vehicles/by-id/${id}`).then((r) => r.data);
export const crmCustomer = (id) =>
  api.get(`/crm/customers/${id}`).then((r) => r.data);
export const crmVehicleByVin = (vin) =>
  api.get(`/crm/vehicles/${vin}`).then((r) => r.data);
export const crmVehicleByPlate = (plate) =>
  api.get(`/crm/vehicles/by-plate/${plate}`).then((r) => r.data);
export const crmAppointments = (vehicleId) =>
  api.get(`/crm/appointments/${vehicleId}`).then((r) => r.data);
export const crmCreateAppointment = (payload) =>
  api.post(`/crm/appointments`, payload).then((r) => r.data);
export const crmFinance = (customerId, otpVerified = false) =>
  api
    .get(`/crm/finance/${customerId}`, { params: { otpVerified } })
    .then((r) => r.data);
export const crmPaylink = (customerId) =>
  api.post(`/crm/paylink`, { customerId }).then((r) => r.data);
export const crmLogInteraction = (payload) =>
  api.post(`/crm/interactions`, payload).then((r) => r.data);
export const crmInteractions = (customerId) =>
  api.get(`/crm/interactions/${customerId}`).then((r) => r.data);

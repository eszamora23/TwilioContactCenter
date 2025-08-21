import http from '../../../shared/services/http.js';

export const crmVehicleById = (id) =>
  http.get(`/crm/vehicles/by-id/${id}`).then((r) => r.data);

export const crmCustomer = (id) =>
  http.get(`/crm/customers/${id}`).then((r) => r.data);

export const crmVehicleByVin = (vin) =>
  http.get(`/crm/vehicles/${vin}`).then((r) => r.data);

export const crmVehicleByPlate = (plate) =>
  http.get(`/crm/vehicles/by-plate/${plate}`).then((r) => r.data);

export const crmAppointments = (vehicleId) =>
  http.get(`/crm/appointments/${vehicleId}`).then((r) => r.data);

export const crmCreateAppointment = (payload) =>
  http.post(`/crm/appointments`, payload).then((r) => r.data);

export const crmFinance = (customerId, otpVerified = false) =>
  http.get(`/crm/finance/${customerId}`, { params: { otpVerified } }).then((r) => r.data);

export const crmPaylink = (customerId) =>
  http.post(`/crm/paylink`, { customerId }).then((r) => r.data);

export const crmLogInteraction = (payload) =>
  http.post(`/crm/interactions`, payload).then((r) => r.data);

export const crmInteractions = (customerId) =>
  http.get(`/crm/interactions/${customerId}`).then((r) => r.data);

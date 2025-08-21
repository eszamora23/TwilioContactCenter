import { crm } from '../lib/crmClient.js';

export const vehicleById = (id) => crm.vehicleById(id);
export const customerById = (id) => crm.customerById(id);
export const customerByAni = (ani) => crm.customerByAni(String(ani).replace(/\D/g, ''));
export const vehicleByPlate = (plate) => crm.vehicleByPlate(String(plate).toUpperCase());
export const vehicleByVin = (vin) => crm.vehicleByVin(String(vin).toUpperCase());
export const appointments = (vehicleId) => crm.appointments(vehicleId);
export const createAppointment = (payload) => crm.createAppointment(payload);
export const finance = (customerId, otpVerified) => crm.finance(customerId, otpVerified);
export const payLink = (customerId) => crm.payLink(customerId);
export const logInteraction = (payload) => crm.logInteraction(payload);
export const recallsByVin = (vin) => crm.recallsByVin(String(vin).toUpperCase());

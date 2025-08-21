import { crm } from '../lib/crmClient.js';

export const vehicleById = (id) => crm.vehicleById(id);
export const customerById = (id) => crm.customerById(id);
export const vehicleByPlate = (plate) => crm.vehicleByPlate(plate);
export const vehicleByVin = (vin) => crm.vehicleByVin(vin);
export const appointments = (vehicleId) => crm.appointments(vehicleId);
export const createAppointment = (body) => crm.createAppointment(body);
export const finance = (customerId, otpVerified) => crm.finance(customerId, otpVerified);
export const payLink = (customerId) => crm.payLink(customerId);
export const logInteraction = (body) => crm.logInteraction(body);

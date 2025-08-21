import { crm } from '../lib/crmClient.js';

export const findVehicleByVin = (vin) => crm.vehicleByVin(String(vin).toUpperCase());
export const findVehicleByPlate = (plate) => crm.vehicleByPlate(String(plate).toUpperCase());
export const findCustomerByAni = (ani) => crm.customerByAni(String(ani).replace(/\D/g, ''));
export const findVehicleById = (id) => crm.vehicleById(id);
export const findCustomerById = (id) => crm.customerById(id);
export const getAppointments = (vehicleId) => crm.appointments(vehicleId);
export const createAppointment = (data) => crm.createAppointment(data);
export const getRecallsByVin = (vin) => crm.recallsByVin(String(vin).toUpperCase());
export const getFinance = (customerId, otpVerified) => crm.finance(customerId, otpVerified);
export const createPayLink = (customerId) => crm.payLink(customerId);

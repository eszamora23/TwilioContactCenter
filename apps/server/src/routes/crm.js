import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import {
  getVehicleById,
  getCustomerById,
  getVehicleByPlate,
  getVehicleByVin,
  getAppointments,
  postAppointment,
  getFinance,
  postPayLink,
  postInteraction
} from '../controllers/crm.js';

export const crmProxy = Router();
crmProxy.use(requireAuth);
crmProxy.get('/crm/vehicles/by-id/:id', getVehicleById);
crmProxy.get('/crm/customers/:id', getCustomerById);
crmProxy.get('/crm/vehicles/by-plate/:plate', getVehicleByPlate);
crmProxy.get('/crm/vehicles/:vin', getVehicleByVin);
crmProxy.get('/crm/appointments/:vehicleId', getAppointments);
crmProxy.post('/crm/appointments', postAppointment);
crmProxy.get('/crm/finance/:customerId', getFinance);
crmProxy.post('/crm/paylink', postPayLink);
crmProxy.post('/crm/interactions', postInteraction);

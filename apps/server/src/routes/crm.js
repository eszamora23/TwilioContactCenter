// contact-center/server/src/routes/crm.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import * as crmController from '../controllers/crm.js';

export const crmProxy = Router();
crmProxy.use(requireAuth);

// --- NEW: fetch full vehicle by internal id (for better 360 details) ---
crmProxy.get('/crm/vehicles/by-id/:id', crmController.getVehicleById);

crmProxy.get('/crm/customers/:id', crmController.getCustomerById);

// IMPORTANT: place "by-plate" before ":vin" to avoid route shadowing
crmProxy.get('/crm/vehicles/by-plate/:plate', crmController.getVehicleByPlate);

crmProxy.get('/crm/vehicles/:vin', crmController.getVehicleByVin);

crmProxy.get('/crm/appointments/:vehicleId', crmController.getAppointments);

crmProxy.post('/crm/appointments', crmController.createAppointment);

crmProxy.get('/crm/finance/:customerId', crmController.getFinance);

crmProxy.post('/crm/paylink', crmController.payLink);

crmProxy.post('/crm/interactions', crmController.logInteraction);

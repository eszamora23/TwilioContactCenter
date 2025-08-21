import mongoose from 'mongoose';

const Customer = new mongoose.Schema({
  name: String,
  phones: [String],
  email: String,
  tier: { type: String, default: 'Standard' },
  consents: { type: Object, default: {} },
  defaultVehicleId: String
}, { timestamps: true });

const Vehicle = new mongoose.Schema({
  customerId: String,
  vin: { type: String, index: true },
  plate: { type: String, index: true },
  make: String,
  model: String,
  year: Number,
  mileage: Number,
  warranties: [Object]
}, { timestamps: true });

const Appointment = new mongoose.Schema({
  vehicleId: String,
  serviceType: String,
  datetime: Date,
  status: { type: String, default: 'scheduled' },
  advisorId: String,
  notes: String
}, { timestamps: true });

const Recall = new mongoose.Schema({
  vin: String,
  campaignId: String,
  title: String,
  status: { type: String, default: 'open' },
  oemRef: String
}, { timestamps: true });

const Finance = new mongoose.Schema({
  customerId: { type: String, index: true },
  balance: Number,
  payoffDate: String,
  loyaltyCashback: Number,
  lastPayment: String
}, { timestamps: true });

const Report = new mongoose.Schema({
  vehicleId: String,
  appointmentId: String,
  url: String,
  summary: String
}, { timestamps: true });

const Interaction = new mongoose.Schema({
  customerId: String,
  channel: String,
  intent: String,
  taskSid: String,
  callSid: String,
  disposition: String,
  notes: String,
  csat: Number
}, { timestamps: true });

export const Models = {
  Customer: mongoose.model('customers', Customer),
  Vehicle: mongoose.model('vehicles', Vehicle),
  Appointment: mongoose.model('appointments', Appointment),
  Recall: mongoose.model('recalls', Recall),
  Finance: mongoose.model('finance', Finance),
  Report: mongoose.model('reports', Report),
  Interaction: mongoose.model('interactions', Interaction)
};

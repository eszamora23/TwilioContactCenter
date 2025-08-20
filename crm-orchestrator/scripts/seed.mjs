/**
 * contact-center/crm-orchestrator/scripts/seed.mjs
 * Seed con MongoDB Driver nativo
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_demo';
const dbPath = new URL(uri).pathname.replace(/^\//, '');
const dbName = dbPath || 'crm_demo';

const N_CUSTOMERS = Number(process.env.SEED_CUSTOMERS || 40);
const RESET = String(process.env.SEED_RESET || 'true') === 'true';

// -------- utilidades básicas --------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const uniq = (arr) => Array.from(new Set(arr));

const FIRST = ['Alex','Taylor','Jordan','Sam','Chris','Jamie','Avery','Riley','Casey','Morgan','Dana','Skyler','Robin','Quinn','Reese','Jessie','Shawn','Cameron'];
const LAST  = ['Johnson','Martinez','Nguyen','Brown','Davis','Miller','Wilson','Anderson','Thomas','Jackson','Harris','Clark','Lewis','Young','Walker','Hall','Allen','King'];
const TIERS = ['Standard','Silver','Gold','Platinum'];

const MAKES = {
  Honda: ['Civic','Accord','CR-V','Pilot'],
  Toyota: ['Corolla','Camry','RAV4','Highlander'],
  Ford:   ['Focus','Fusion','Escape','Explorer','F-150'],
  BMW:    ['320i','330e','X1','X3','X5'],
  Audi:   ['A3','A4','Q3','Q5','Q7'],
  Nissan: ['Sentra','Altima','Rogue','Pathfinder'],
  Chevrolet: ['Malibu','Equinox','Traverse','Silverado'],
};

const SERVICE_TYPES = ['Oil Change','Tire Rotation','Brake Inspection','Warranty Service','Recall Repair','Diagnostics'];
const RECALL_CAMPAIGNS = [
  { campaignId: 'RC-AB12', title: 'Airbag Inflator' },
  { campaignId: 'RC-EL45', title: 'Electrical Harness' },
  { campaignId: 'RC-FU93', title: 'Fuel Pump Module' },
  { campaignId: 'RC-BR22', title: 'Brake Hose Routing' },
];

const ADVISORS = ['ADV-001','ADV-002','ADV-003','ADV-004','ADV-005'];

// VIN: 17 caracteres (sin I,O,Q)
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
function newVin() {
  let s = '';
  for (let i = 0; i < 17; i++) s += VIN_CHARS[rand(0, VIN_CHARS.length - 1)];
  return s;
}
function newPlate() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = '0123456789';
  return `${letters[rand(0,25)]}${letters[rand(0,25)]}${letters[rand(0,25)]}-${nums[rand(0,9)]}${nums[rand(0,9)]}${nums[rand(0,9)]}`;
}
function fakeUSPhone() {
  const area = String(rand(201, 989));
  const mid  = String(rand(200, 999)).padStart(3,'0');
  const end  = String(rand(1000, 9999)).padStart(4,'0');
  const e164 = `+1${area}${mid}${end}`;
  return [e164, `${area}${mid}${end}`];
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function randomPastDate(daysBack=120) { return addDays(Date.now(), -rand(0, daysBack)); }
function randomFutureDate(daysForward=60) { return addDays(Date.now(), rand(1, daysForward)); }

const client = new MongoClient(uri);

async function resetCollections(db) {
  const names = ['customers','vehicles','appointments','recalls','finance','reports','interactions'];
  for (const name of names) {
    try { await db.collection(name).drop(); } catch {}
  }
}

async function seedRecallsForVin(db, vin) {
  const qty = chance(0.35) ? rand(1, 2) : 0;
  const docs = [];
  for (let i=0;i<qty;i++) {
    const campaign = pick(RECALL_CAMPAIGNS);
    const open = chance(0.55);
    const doc = {
      vin,
      campaignId: campaign.campaignId,
      title: campaign.title,
      status: open ? 'open' : 'closed',
      oemRef: `OEM-${rand(100,999)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection('recalls').insertOne(doc);
    docs.push(doc);
  }
  return docs;
}

async function seedAppointments(db, vehicleId) {
  const docs = [];

  // 1-3 pasadas
  const pastCount = rand(1, 3);
  for (let i=0;i<pastCount;i++) {
    const dt = randomPastDate(180);
    const status = chance(0.85) ? 'completed' : 'canceled';
    const stype = pick(SERVICE_TYPES);
    const appt = {
      vehicleId,
      serviceType: stype,
      datetime: dt,
      status,
      advisorId: pick(ADVISORS),
      notes: status === 'completed' ? 'All good' : 'Customer canceled',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection('appointments').insertOne(appt);
    docs.push(appt);

    // Report opcional
    if (status === 'completed' && chance(0.7)) {
      await db.collection('reports').insertOne({
        vehicleId,
        appointmentId: (appt._id || new ObjectId()).toString(),
        url: `https://cdn.demo.example/reports/${(appt._id || new ObjectId()).toString()}.pdf`,
        summary: `${stype} performed. No critical issues.`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Próxima cita futura ~60%
  if (chance(0.6)) {
    const dt = randomFutureDate(75);
    const stype = pick(SERVICE_TYPES);
    const appt = {
      vehicleId,
      serviceType: stype,
      datetime: dt,
      status: 'scheduled',
      advisorId: pick(ADVISORS),
      notes: 'Scheduled via seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection('appointments').insertOne(appt);
    docs.push(appt);
  }

  return docs.sort((a,b) => new Date(b.datetime) - new Date(a.datetime));
}

async function seedFinance(db, customerId) {
  if (!chance(0.7)) return null;
  const doc = {
    customerId,
    balance: rand(1200, 45000),
    payoffDate: `${rand(2025,2028)}-${String(rand(1,12)).padStart(2,'0')}-${String(rand(1,28)).padStart(2,'0')}`,
    loyaltyCashback: chance(0.6) ? rand(100, 1500) : 0,
    lastPayment: `${rand(2024,2025)}-${String(rand(1,12)).padStart(2,'0')}-${String(rand(1,28)).padStart(2,'0')}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection('finance').insertOne(doc);
  return doc;
}

async function seedInteractions(db, customerId) {
  const intents = ['service_status','recall_schedule','finance_balance','sales_cashback','general_inquiry'];
  const channel = pick(['voice','sms','whatsapp']);
  const qty = rand(0, 2);
  for (let i=0;i<qty;i++) {
    await db.collection('interactions').insertOne({
      customerId,
      channel,
      intent: pick(intents),
      taskSid: null,
      callSid: null,
      disposition: pick(['Resolved','Escalated','Callback scheduled','Wrong number']),
      notes: 'Seeded interaction',
      csat: chance(0.6) ? rand(3,5) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

async function seedCustomer(db, index) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const name = `${first} ${last}`;
  const email = `${first}.${last}${rand(1,999)}@example.com`.toLowerCase();

  const ph = fakeUSPhone();
  const phones = uniq([ph[0], ph[1]]);

  const tier = pick(TIERS);
  const customer = {
    name, email, phones, tier,
    consents: { marketing: chance(0.7) },
    defaultVehicleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const cRes = await db.collection('customers').insertOne(customer);
  const customerId = cRes.insertedId.toString();

  const make = pick(Object.keys(MAKES));
  const vehiclesDocs = [];
  const vCount = rand(1,3);
  for (let i=0;i<vCount;i++) {
    const model = pick(MAKES[make]);
    const year = rand(2015, 2024);
    const mileage = rand(8000, 120000);
    const vin = newVin();
    const plate = newPlate();

    const vehicle = {
      customerId,
      vin,
      plate,
      make,
      model,
      year,
      mileage,
      warranties: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const vRes = await db.collection('vehicles').insertOne(vehicle);
    const vehicleId = vRes.insertedId.toString();
    vehiclesDocs.push({ ...vehicle, _id: vRes.insertedId });

    await seedRecallsForVin(db, vin);
    await seedAppointments(db, vehicleId);
  }

  await db.collection('customers').updateOne(
    { _id: new ObjectId(customerId) },
    { $set: { defaultVehicleId: vehiclesDocs[0]?._id?.toString() || null } }
  );

  await seedFinance(db, customerId);
  await seedInteractions(db, customerId);

  return { customerId, vehicles: vehiclesDocs.map(v => v._id.toString()) };
}

// Cliente/vehículo “ancla”
// Cliente/vehículo “ancla”
async function seedAnchor(db) {
  // 👇 AQUI plantamos tu número real para el demo
  const customer = {
    name: 'Alex Johnson',
    phones: ['+19793416695', '19793416695'], // <- E.164 y sólo dígitos
    email: 'alex@example.com',
    tier: 'Gold',
    consents: {},
    defaultVehicleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const cRes = await db.collection('customers').insertOne(customer);
  const customerId = cRes.insertedId.toString();

  const vehicle = {
    customerId,
    vin: '1HGCM82633A123456',
    plate: 'ABC-123',
    make: 'Honda',
    model: 'Accord',
    year: 2019,
    mileage: 42000,
    warranties: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const vRes = await db.collection('vehicles').insertOne(vehicle);
  const vehicleId = vRes.insertedId.toString();

  await db.collection('appointments').insertOne({
    vehicleId,
    serviceType: 'Oil Change',
    datetime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    status: 'completed',
    notes: 'Synthetic, all good',
    advisorId: 'ADV-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('finance').insertOne({
    customerId,
    balance: 12450,
    payoffDate: '2025-12-01',
    loyaltyCashback: 600,
    lastPayment: '2025-07-10',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('recalls').insertOne({
    vin: vehicle.vin,
    campaignId: 'RC-AB12',
    title: 'Airbag Inflator',
    status: 'open',
    oemRef: 'OEM-999',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('appointments').insertOne({
    vehicleId,
    serviceType: 'Warranty Service',
    datetime: addDays(Date.now(), 14),
    status: 'scheduled',
    notes: 'Scheduled via anchor seed',
    advisorId: 'ADV-002',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('customers').updateOne(
    { _id: new ObjectId(customerId) },
    { $set: { defaultVehicleId: vehicleId } }
  );

  await db.collection('interactions').insertOne({
    customerId,
    channel: 'voice',
    intent: 'service_status',
    taskSid: null,
    callSid: null,
    disposition: 'Resolved',
    notes: 'Previous status check',
    csat: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('[anchor] customer', customerId, 'vehicle', vehicleId);
}


async function run() {
  await client.connect();
  const db = client.db(dbName);

  if (RESET) await resetCollections(db);

  // Crea índices básicos (opcional)
  await db.collection('vehicles').createIndex({ vin: 1 });
  await db.collection('vehicles').createIndex({ plate: 1 });
  await db.collection('finance').createIndex({ customerId: 1 });

  // 1) ancla determinística
  await seedAnchor(db);

  // 2) clientes aleatorios
  const created = [];
  for (let i = 0; i < N_CUSTOMERS; i++) {
    const r = await seedCustomer(db, i);
    created.push(r);
  }

  // resumen
  const counts = await Promise.all([
    db.collection('customers').countDocuments(),
    db.collection('vehicles').countDocuments(),
    db.collection('appointments').countDocuments(),
    db.collection('recalls').countDocuments(),
    db.collection('finance').countDocuments(),
    db.collection('reports').countDocuments(),
    db.collection('interactions').countDocuments(),
  ]);

  console.log('---------------------------------------');
  console.log('Seed OK');
  console.log('Customers     :', counts[0]);
  console.log('Vehicles      :', counts[1]);
  console.log('Appointments  :', counts[2]);
  console.log('Recalls       :', counts[3], '(incluye open & closed; la API lista solo "open")');
  console.log('Finance       :', counts[4]);
  console.log('Reports       :', counts[5]);
  console.log('Interactions  :', counts[6]);
  console.log('Tip: prueba IVR lookup con VIN 1HGCM82633A123456 o ANI +12125551234');
  console.log('---------------------------------------');

  await client.close();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

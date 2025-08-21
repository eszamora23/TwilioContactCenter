// contact-center/crm-orchestrator/src/db.js
import { MongoClient, ServerApiVersion } from 'mongodb';
import { env } from './env.js';

let _client;
let _db;

export async function connectDb() {
  if (_client && _db) return { client: _client, db: _db };

  const uri = env.mongoUri;
  if (!uri) throw new Error('MONGODB_URI is not set');

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();

  // Si la URI incluye /<dbname> úsalo; si no, por defecto crm_demo
  const dbPath = new URL(uri).pathname.replace(/^\//, '');
  const dbName = dbPath || 'crm_demo';

  const db = client.db(dbName);

  _client = client;
  _db = db;

  // Ping opcional
  await db.command({ ping: 1 });
  console.log(`[MongoDB] Connected to ${db.databaseName}`);

  return { client, db };
}

export function collections() {
  if (!_db) throw new Error('DB not connected. Call connectDb() first.');
  return {
    customers: _db.collection('customers'),
    vehicles: _db.collection('vehicles'),
    appointments: _db.collection('appointments'),
    recalls: _db.collection('recalls'),
    finance: _db.collection('finance'),
    reports: _db.collection('reports'),
    interactions: _db.collection('interactions'),
  };
}

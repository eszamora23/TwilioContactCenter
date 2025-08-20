import 'dotenv/config';

export const env = {
  port: Number(process.env.CRM_PORT || 4100),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_demo',
  jwtAudience: process.env.JWT_AUDIENCE || 'crm-orchestrator',
  jwtIssuersCsv: process.env.JWT_ISSUERS || 'server',
  jwtKey: process.env.JWT_KEY || 'crm-orch-demo-key'
};

export const allowedIssuers = env.jwtIssuersCsv.split(',').map(s => s.trim()).filter(Boolean);
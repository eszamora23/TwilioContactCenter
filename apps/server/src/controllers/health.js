import * as healthService from '../services/health.js';

export function checkHealth(_req, res) {
  res.json(healthService.check());
}

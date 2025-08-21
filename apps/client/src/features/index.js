import * as auth from './auth/services/auth.js';
import * as voice from './softphone/services/voice.js';
import * as taskRouter from './tasks/services/taskRouter.js';
import * as crm from './tasks/services/crm.js';
import * as reports from './tasks/services/reports.js';

export const Api = {
  ...auth,
  ...voice,
  ...taskRouter,
  ...crm,
  ...reports,
};

export default Api;

export { auth, voice, taskRouter, crm, reports };

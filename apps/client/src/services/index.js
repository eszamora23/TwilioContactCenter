import * as auth from './auth.js';
import * as voice from './voice.js';
import * as taskRouter from './taskRouter.js';
import * as crm from './crm.js';
import * as reports from './reports.js';

export { setAuth } from './http.js';

export const Api = {
  ...auth,
  ...voice,
  ...taskRouter,
  ...crm,
  ...reports,
};

export default Api;

export { auth, voice, taskRouter, crm, reports };

import * as auth from './auth.js';
import * as voice from './voice.js';
import * as taskRouter from './taskRouter.js';
import * as crm from './crm.js';
import * as reports from './reports.js';

export { setAuth, retry, default as http } from './http.js';
export { auth, voice, taskRouter, crm, reports };

export const Api = {
  ...auth,
  ...voice,
  ...taskRouter,
  ...crm,
  ...reports,
};

export default Api;

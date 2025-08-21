// contact-center/server/src/routes/taskrouter.js
import { Router } from 'express';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';
import { requireAuth } from '@shared/auth';
import * as taskrouterController from '../controllers/taskrouter.js';

export const taskrouter = Router();

taskrouter.post('/taskrouter/assignment', verifyTwilioSignature, taskrouterController.assignment);

taskrouter.post('/taskrouter/events', verifyTwilioSignature, taskrouterController.events);

taskrouter.get('/taskrouter/activities', taskrouterController.activities);

taskrouter.get('/taskrouter/my-tasks', requireAuth, taskrouterController.myTasks);

taskrouter.post('/taskrouter/tasks/:taskSid/complete', requireAuth, taskrouterController.completeTask);

taskrouter.get('/taskrouter/available-workers', requireAuth, taskrouterController.availableWorkers);

taskrouter.get('/taskrouter/presence', requireAuth, taskrouterController.presence);

taskrouter.get('/events/recent', requireAuth, taskrouterController.recentEvents);

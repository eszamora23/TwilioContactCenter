import { Router } from 'express';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';
import { requireAuth } from '@shared/auth';
import {
  assignment,
  events,
  activities,
  myTasks,
  completeTask,
  availableWorkers,
  presence,
  recent
} from '../controllers/taskrouter.js';

export const taskrouter = Router();
taskrouter.post('/taskrouter/assignment', verifyTwilioSignature, assignment);
taskrouter.post('/taskrouter/events', verifyTwilioSignature, events);
taskrouter.get('/taskrouter/activities', activities);
taskrouter.get('/taskrouter/my-tasks', requireAuth, myTasks);
taskrouter.post('/taskrouter/tasks/:taskSid/complete', requireAuth, completeTask);
taskrouter.get('/taskrouter/available-workers', requireAuth, availableWorkers);
taskrouter.get('/taskrouter/presence', requireAuth, presence);
taskrouter.get('/events/recent', requireAuth, recent);

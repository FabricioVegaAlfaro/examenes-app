import { Router } from 'express';
import auth from './auth.routes.js';
import instructor from './instructor.routes.js';
import exam from './exam.routes.js';

const api = Router();

api.use('/auth', auth);
api.use('/instructor', instructor);
api.use('/examen', exam);

export default api;
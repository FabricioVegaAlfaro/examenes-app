import { Router } from 'express';
import { loginInstructor } from '../controllers/auth.controller.js';

const r = Router();

r.post('/instructor/login', loginInstructor);

export default r;
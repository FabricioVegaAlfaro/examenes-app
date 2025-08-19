import { Router } from 'express';
import { crearToken, listarIntentos, detalleIntento } from '../controllers/instructor.controller.js';
import { requireInstructor } from '../middlewares/authInstructor.js';

const r = Router();

r.post('/tokens', requireInstructor, crearToken);
r.get('/intentos', requireInstructor, listarIntentos);
r.get('/intentos/:id', requireInstructor, detalleIntento);

export default r;
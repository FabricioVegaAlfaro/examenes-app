import { Router } from 'express';
import { iniciarExamen, obtenerPreguntaActual, responder, finalizarExamen, resultadoExamen } from '../controllers/exam.controller.js';

const r = Router();

r.post('/iniciar', iniciarExamen); // body: { nombre_completo, codigo_token }

r.get('/:intentoId/pregunta-actual', obtenerPreguntaActual);

r.post('/responder', responder);   // body: { intento_id, pregunta_intento_id, opcion_id }

r.post('/finalizar', finalizarExamen); // body: { intento_id }

r.get('/:intentoId/resultado', resultadoExamen);

export default r;
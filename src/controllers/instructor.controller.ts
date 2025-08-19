import { Request, Response } from 'express';
import { pool, tx } from '../config/db.js';
import { env } from '../config/env.js';
import { generateTokenCode } from '../utils/tokenCode.js';

export const crearToken = async (req: Request, res: Response) => {
  const { expiracionMinutos, observaciones } = req.body as { expiracionMinutos?: number; observaciones?: string };
  const creado_por = req.instructorId!;

  const codigo = generateTokenCode(8);
  const fecha_expiracion = expiracionMinutos ? `now() + interval '${expiracionMinutos} minutes'` : null;

  const insert = `
    INSERT INTO tokens_examen (codigo_token, creado_por, fecha_expiracion, observaciones)
    VALUES ($1, $2, ${fecha_expiracion ? fecha_expiracion : 'NULL'}, $3)
    RETURNING id, codigo_token, fecha_creacion, fecha_expiracion
  `;

  // Reintentar si choca por UNIQUE
  let tries = 0; let row: any;
  while (tries < 5) {
    try {
      const { rows } = await pool.query(insert, [generateTokenCode(8), creado_por, observaciones ?? null]);
      row = rows[0];
      break;
    } catch (e: any) {
      if (e.code === '23505') { tries++; continue; }
      throw e;
    }
  }
  if (!row) return res.status(500).json({ error: 'No se pudo crear token' });

  const shareText = encodeURIComponent(
    `Hola

  Por favor sigue estas instrucciones para hacer tu examen de *MANIPULACIÓN DE ALIMENTOS*:

  *1.* Ingresa al sitio web: https://frontend-examenes.onrender.com/usuario

  *2.* Escribe tu *NOMBRE COMPLETO* exactamente como aparece en tu cédula.

  *3.* Coloca el siguiente *TOKEN* para poder iniciar el examen:

  - Token de examen: ${row.codigo_token}

  ¡Mucho éxito!`
  );

  const whatsappUrl = `https://wa.me/?text=${shareText}`;
  res.status(201).json({ token: row.codigo_token, vence: row.fecha_expiracion, whatsappUrl });
};

export const listarIntentos = async (req: Request, res: Response) => {
  const search = (req.query.search as string | undefined) ?? '';
  const q = `
    SELECT * FROM vista_resumen_intentos
    WHERE ($1 = '' OR nombre_usuario ILIKE '%' || $1 || '%')
    ORDER BY fecha_inicio DESC
    LIMIT 200
  `;
  const { rows } = await pool.query(q, [search]);
  res.json(rows);
};

export const detalleIntento = async (req: Request, res: Response) => {
  const { id } = req.params;
  const infoQ = `SELECT * FROM vista_resumen_intentos WHERE id_intento = $1`;
  const { rows } = await pool.query(infoQ, [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Intento no encontrado' });

  const preguntasQ = `
    SELECT pi.id as pregunta_intento_id, pi.posicion, p.enunciado,
           json_agg(json_build_object('id', o.id, 'texto', o.texto, 'es_correcta', o.es_correcta) ORDER BY o.id) AS opciones
    FROM preguntas_intento pi
    JOIN preguntas p ON p.id = pi.pregunta_id
    JOIN opciones o ON o.pregunta_id = p.id
    WHERE pi.intento_id = $1
    GROUP BY pi.id, pi.posicion, p.enunciado
    ORDER BY pi.posicion
  `;
  const preguntas = (await pool.query(preguntasQ, [id])).rows;

  const respuestasQ = `
    SELECT r.pregunta_intento_id, r.opcion_id, r.fecha_respuesta
    FROM respuestas r
    JOIN preguntas_intento pi ON pi.id = r.pregunta_intento_id
    WHERE pi.intento_id = $1
  `;
  const respuestas = (await pool.query(respuestasQ, [id])).rows;

  res.json({ intento: rows[0], preguntas, respuestas });
};
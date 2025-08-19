import { Request, Response } from 'express';
import { pool, tx } from '../config/db.js';
import { env } from '../config/env.js';
import { addMinutes } from '../utils/time.js';

// 🔹 Finaliza intento si expiró
async function finalizeIfExpired(intentoId: string) {
  try {
    const q = `SELECT fecha_inicio, estado FROM intentos_examen WHERE id = $1`;
    const { rows } = await pool.query(q, [intentoId]);
    if (rows.length === 0) return null;
    const { fecha_inicio, estado } = rows[0];
    if (estado !== 'en_progreso') return null;

    const expiresAt = new Date(new Date(fecha_inicio).getTime() + env.EXAM_DURATION_MINUTES * 60_000);
    if (Date.now() > expiresAt.getTime()) {
      await pool.query(`UPDATE intentos_examen SET estado='expirado', fecha_fin = now() WHERE id = $1`, [intentoId]);
      await pool.query(`SELECT finalizar_intento($1)`, [intentoId]);
      return 'expired-finalized';
    }
    return null;
  } catch (err) {
    console.error('Error finalizeIfExpired:', err);
    return null;
  }
}

// 🔹 Iniciar examen
export const iniciarExamen = async (req: Request, res: Response) => {
  try {
    const { nombre_completo, codigo_token } = req.body as { nombre_completo: string; codigo_token: string };
    if (!nombre_completo || !codigo_token) {
      return res.status(400).json({ error: 'nombre_completo y codigo_token requeridos' });
    }

    const result = await tx(async (client) => {
      const tokRes = await client.query(`SELECT * FROM tokens_examen WHERE codigo_token = $1 FOR UPDATE`, [codigo_token]);
      if (tokRes.rows.length === 0) return { error: 'Token no válido' };

      const token = tokRes.rows[0];
      if (token.fecha_uso) return { error: 'Token ya fue usado' };
      if (token.fecha_expiracion && new Date(token.fecha_expiracion).getTime() < Date.now()) return { error: 'Token expirado' };

      const intentoRes = await client.query(
        `INSERT INTO intentos_examen (token_id, nombre_usuario) VALUES ($1, $2) RETURNING id, fecha_inicio`,
        [token.id, nombre_completo]
      );
      const intento = intentoRes.rows[0];

      await client.query(`SELECT asignar_preguntas_aleatorias($1, $2)`, [intento.id, env.EXAM_QUESTIONS_COUNT]);

      const q1 = await client.query(
        `SELECT pi.id as pregunta_intento_id, pi.posicion, p.enunciado,
              json_agg(json_build_object('id', o.id, 'texto', o.texto) ORDER BY random()) as opciones
         FROM preguntas_intento pi
         JOIN preguntas p ON p.id = pi.pregunta_id
         JOIN opciones o ON o.pregunta_id = p.id
         WHERE pi.intento_id = $1 AND pi.posicion = 1
         GROUP BY pi.id, pi.posicion, p.enunciado`,
        [intento.id]
      );

      const expiresAt = addMinutes(intento.fecha_inicio, env.EXAM_DURATION_MINUTES);

      return { intento_id: intento.id, expiresAt, pregunta: q1.rows[0] };
    });

    if ('error' in result) {
      return res.status(401).json({ error: result.error });
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('Error iniciarExamen:', err);
    res.status(500).json({ error: 'Error iniciando examen' });
  }
};

// 🔹 Obtener pregunta actual
export const obtenerPreguntaActual = async (req: Request, res: Response) => {
  try {
    const intentoId = req.params.intentoId;
    await finalizeIfExpired(intentoId);

    const est = await pool.query(`SELECT estado, fecha_inicio FROM intentos_examen WHERE id = $1`, [intentoId]);
    if (est.rows.length === 0) return res.status(404).json({ error: 'Intento no encontrado' });

    if (est.rows[0].estado !== 'en_progreso') {
      const fin = await pool.query(`SELECT nota, aprobado, estado FROM intentos_examen WHERE id=$1`, [intentoId]);
      return res.json({ finalizado: true, ...fin.rows[0] });
    }

    const q = `
      WITH respondidas AS (
        SELECT COUNT(*)::int c
        FROM respuestas r
        JOIN preguntas_intento pi ON pi.id = r.pregunta_intento_id
        WHERE pi.intento_id = $1
      )
      SELECT pi.id as pregunta_intento_id, pi.posicion, p.enunciado,
            json_agg(json_build_object('id', o.id, 'texto', o.texto) ORDER BY random()) as opciones
      FROM preguntas_intento pi
      CROSS JOIN respondidas r
      JOIN preguntas p ON p.id = pi.pregunta_id
      JOIN opciones o ON o.pregunta_id = p.id
      WHERE pi.intento_id = $1 AND pi.posicion = r.c + 1
      GROUP BY pi.id, pi.posicion, p.enunciado;
    `;
    const { rows } = await pool.query(q, [intentoId]);
    if (rows.length === 0) return res.json({ finalizado: true });

    const inicio = est.rows[0].fecha_inicio as string;
    const expiresAt = addMinutes(inicio, env.EXAM_DURATION_MINUTES);
    res.json({ finalizado: false, expiresAt, pregunta: rows[0] });
  } catch (err) {
    console.error('Error obtenerPreguntaActual:', err);
    res.status(500).json({ error: 'Error obteniendo la pregunta' });
  }
};

// 🔹 Responder pregunta
export const responder = async (req: Request, res: Response) => {
  try {
    const { intento_id, pregunta_intento_id, opcion_id } = req.body as { intento_id: string; pregunta_intento_id: string; opcion_id: string };
    if (!intento_id || !pregunta_intento_id || !opcion_id) return res.status(400).json({ error: 'Campos requeridos faltantes' });

    await finalizeIfExpired(intento_id);

    const est = await pool.query(`SELECT estado FROM intentos_examen WHERE id = $1`, [intento_id]);
    if (est.rows.length === 0) return res.status(404).json({ error: 'Intento no encontrado' });
    if (est.rows[0].estado !== 'en_progreso') return res.status(409).json({ error: 'El examen ya finalizó' });

    const { rows: posRows } = await pool.query(
      `SELECT pi.posicion,
              (SELECT COUNT(*) FROM respuestas r JOIN preguntas_intento pi2 ON pi2.id=r.pregunta_intento_id WHERE pi2.intento_id=$1) AS respondidas
       FROM preguntas_intento pi
       WHERE pi.id = $2 AND pi.intento_id = $1`,
      [intento_id, pregunta_intento_id]
    );

    if (posRows.length === 0) return res.status(400).json({ error: 'pregunta_intento_id inválido' });
    const { posicion, respondidas } = posRows[0];
    if (Number(posicion) !== Number(respondidas) + 1) return res.status(409).json({ error: 'No se permite responder fuera de orden' });

    try {
      await pool.query(`INSERT INTO respuestas (pregunta_intento_id, opcion_id) VALUES ($1, $2)`, [pregunta_intento_id, opcion_id]);
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: 'La pregunta ya fue respondida' });
      throw e;
    }

    const next = await pool.query(
      `WITH c AS (
        SELECT COUNT(*)::int c
        FROM respuestas r
        JOIN preguntas_intento pi ON pi.id = r.pregunta_intento_id
        WHERE pi.intento_id = $1
      )
      SELECT pi.id as pregunta_intento_id, pi.posicion, p.enunciado,
            json_agg(json_build_object('id', o.id, 'texto', o.texto) ORDER BY random()) as opciones
      FROM preguntas_intento pi
      CROSS JOIN c
      JOIN preguntas p ON p.id = pi.pregunta_id
      JOIN opciones o ON o.pregunta_id = p.id
      WHERE pi.intento_id = $1 AND pi.posicion = c.c + 1
      GROUP BY pi.id, pi.posicion, p.enunciado;
      `,
      [intento_id]
    );

    if (next.rows.length === 0) {
      await pool.query(`SELECT finalizar_intento($1)`, [intento_id]);
      const fin = await pool.query(`SELECT nota, aprobado, estado FROM intentos_examen WHERE id=$1`, [intento_id]);
      return res.json({ finalizado: true, ...fin.rows[0] });
    }

    res.json({ finalizado: false, pregunta: next.rows[0] });
  } catch (err) {
    console.error('Error responder:', err);
    res.status(500).json({ error: 'Error procesando la respuesta' });
  }
};

// 🔹 Finalizar examen manualmente
export const finalizarExamen = async (req: Request, res: Response) => {
  try {
    const { intento_id } = req.body as { intento_id: string };
    if (!intento_id) return res.status(400).json({ error: 'intento_id requerido' });

    await pool.query(`SELECT finalizar_intento($1)`, [intento_id]);
    const fin = await pool.query(`SELECT nota, aprobado, estado FROM intentos_examen WHERE id=$1`, [intento_id]);
    res.json({ finalizado: true, ...fin.rows[0] });
  } catch (err) {
    console.error('Error finalizarExamen:', err);
    res.status(500).json({ error: 'Error finalizando el examen' });
  }
};

// 🔹 Obtener resultado
export const resultadoExamen = async (req: Request, res: Response) => {
  try {
    const { intentoId } = req.params;
    await finalizeIfExpired(intentoId);
    const fin = await pool.query(`SELECT nota, aprobado, estado FROM intentos_examen WHERE id=$1`, [intentoId]);
    if (fin.rows.length === 0) return res.status(404).json({ error: 'Intento no encontrado' });
    res.json({ finalizado: fin.rows[0].estado !== 'en_progreso', ...fin.rows[0] });
  } catch (err) {
    console.error('Error resultadoExamen:', err);
    res.status(500).json({ error: 'Error obteniendo el resultado' });
  }
};

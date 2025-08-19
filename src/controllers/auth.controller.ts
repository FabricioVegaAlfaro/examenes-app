import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

export const loginInstructor = async (req: Request, res: Response) => {
  const { usuario, password } = req.body as { usuario: string; password: string };
  if (!usuario || !password) return res.status(400).json({ error: 'usuario y password requeridos' });

  // Validar en PostgreSQL con pgcrypto (crypt)
  const q = `
    SELECT id, usuario, nombre_completo, fecha_creacion
    FROM instructores
    WHERE usuario = $1
      AND contrasena_hash = crypt($2, contrasena_hash)
  `;
  const { rows } = await pool.query(q, [usuario, password]);
  if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

  const inst = rows[0];
  const token = jwt.sign({ sub: inst.id, usuario: inst.usuario }, env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, instructor: { id: inst.id, usuario: inst.usuario, nombre: inst.nombre_completo } });
};
import 'dotenv/config';

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL', process.env.DATABASE_URL!),
  JWT_SECRET: required('JWT_SECRET', process.env.JWT_SECRET!),
  EXAM_DURATION_MINUTES: Number(process.env.EXAM_DURATION_MINUTES ?? 20),
  EXAM_QUESTIONS_COUNT: Number(process.env.EXAM_QUESTIONS_COUNT ?? 30),
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:4000'
};
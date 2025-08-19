import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import api from './routes/index.js';

const allowedOrigins = [
  "http://localhost:5173",
  "https://frontend-examenes.onrender.com"
];

const app = express();
app.use(helmet());
app.use(cors({
  origin: allowedOrigins, // URL de tu frontend
  credentials: true
}));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api', api);

export default app;
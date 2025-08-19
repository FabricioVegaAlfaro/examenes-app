import app from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`API escuchando en https://examenes-app-354o.onrender.com:${env.PORT}`);
});
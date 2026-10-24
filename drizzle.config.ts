import { config } from 'dotenv';

// ENV_FILE elige el entorno: sin definir usa .env.local (rama dev de Neon); .env.neon-production apunta a producción.
config({ path: process.env.ENV_FILE ?? '.env.local' });
import { defineConfig } from 'drizzle-kit';

// Las migraciones usan la conexión DIRECTA (no pooled) con el rol dueño de las tablas.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_MIGRATE ?? '' },
});

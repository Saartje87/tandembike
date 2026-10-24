import { defineConfig } from 'drizzle-kit';

// Used only by `npm run db:generate` to write a migration after a schema
// change. Migrations are applied automatically when the app connects.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});

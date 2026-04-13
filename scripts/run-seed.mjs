import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!databaseUrl) {
  console.error(
    'Falta la URL de Postgres. En .env.local define una de: DATABASE_URL, SUPABASE_DATABASE_URL, POSTGRES_URL.\n' +
      'Supabase: Settings → Database → Connection string → URI (modo Session o Transaction).'
  );
  process.exit(1);
}

const sqlPath = path.join(root, 'supabase', 'seed.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const useSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl);
const client = new pg.Client({
  connectionString: databaseUrl,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  await client.connect();
  await client.query(sql);
  console.log('Seed aplicado correctamente:', sqlPath);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}

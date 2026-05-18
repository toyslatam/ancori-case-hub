/**
 * Prueba local: OAuth2 token + POST /api/Consulta/Buscar (HubQueryEngine AgileCheck).
 *
 * Uso:
 *   1) Variables en `supabase/functions/.env` y/o `.env.local` (sin `#` al inicio de la línea: si está comentado, Node no lo lee).
 *   2) Carga en este orden: `.env` luego `.env.local` (`.env.local` pisa a `.env`).
 *   3) Obligatorias: AGILECHECK_TOKEN_URL, AGILECHECK_USERNAME, AGILECHECK_PASSWORD, AGILECHECK_API_BASE
 *   4) Opcional: AGILECHECK_LISTA_IDS=… (si no, intenta GET /api/List/GetListas)
 *   5) npm run test:agilecheck-buscar
 *
 * O exporta las mismas variables en la terminal y ejecuta el script.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = join(root, 'supabase', 'functions', '.env');
const envLocal = join(root, 'supabase', 'functions', '.env.local');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Primero .env, luego .env.local (sobreescribe)
loadEnvFile(envFile);
loadEnvFile(envLocal);

const TOKEN_URL = process.env.AGILECHECK_TOKEN_URL?.trim();
const USERNAME = process.env.AGILECHECK_USERNAME?.trim();
const PASSWORD = process.env.AGILECHECK_PASSWORD?.trim();
const GRANT_TYPE = process.env.AGILECHECK_GRANT_TYPE?.trim() || 'password';
const API_BASE = process.env.AGILECHECK_API_BASE?.trim();
const LISTA_IDS_RAW = process.env.AGILECHECK_LISTA_IDS?.trim();
const PAIS_ID = Number(process.env.AGILECHECK_PAIS_ID ?? '0') || 0;
const PAIS = process.env.AGILECHECK_PAIS?.trim() ?? '';
const QUERY_MODE = Number(process.env.AGILECHECK_QUERY_MODE ?? '0') || 0;

// Búsqueda de prueba (cambiar por datos reales de prueba en vuestro entorno)
const TEST_NOMBRES = process.env.AGILECHECK_TEST_NOMBRES?.trim() || 'Sociedad Prueba Ancori';
const TEST_APELLIDOS = process.env.AGILECHECK_TEST_APELLIDOS?.trim() || 'Sociedad Prueba Ancori';
const TEST_ES_JURIDICO = (process.env.AGILECHECK_TEST_ES_JURIDICO ?? 'true').toLowerCase() === 'true';
const TEST_NUMERO_ID = process.env.AGILECHECK_TEST_NUMERO_ID?.trim() || '';

async function getToken() {
  const body = new URLSearchParams();
  body.set('username', USERNAME);
  body.set('password', PASSWORD);
  body.set('grant_type', GRANT_TYPE);

  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? err.cause : undefined;
    let code = '';
    if (cause != null && typeof cause === 'object') {
      const v = Reflect.get(cause, 'code');
      if (v !== undefined && v !== null) code = String(v);
    }
    const causeMsg = cause instanceof Error ? cause.message : cause != null ? String(cause) : '';
    let host = '?';
    try {
      host = new URL(TOKEN_URL).hostname;
    } catch { /* ignore */ }

    const looksDns =
      code === 'ENOTFOUND' ||
      msg.includes('getaddrinfo ENOTFOUND') ||
      causeMsg.includes('ENOTFOUND') ||
      causeMsg.includes('getaddrinfo');

    if (looksDns) {
      throw new Error(
        `No hay conexión al servidor de AgileCheck (DNS / red).\n\n` +
          `Tu PC intentó hablar con el host: "${host}"\n` +
          `y no pudo encontrarlo o no pudo llegar (firewall, VPN, DNS de la oficina, o URL mal escrita).\n\n` +
          `Qué hacer:\n` +
          `  • Si usás el Swagger de PRUEBAS, en .env poné el mismo host PRUEBAS en TOKEN_URL y API_BASE:\n` +
          `      AGILECHECK_TOKEN_URL=https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/api/oauth2/token\n` +
          `      AGILECHECK_API_BASE=https://pruebas.agilecheck.io/HubQueryEngine_agilecheck\n` +
          `  • Si debe ser PRODUCCIÓN (app.agilecheck.io), probá otra red o pedí a IT que ese nombre resuelva en internet.\n\n` +
          `Técnico: ${msg}${causeMsg ? ` | causa: ${causeMsg}` : ''}`,
      );
    }
    throw new Error(
      `Fallo de red al pedir el token (host: ${host}). ${msg}${causeMsg ? ` | causa: ${causeMsg}` : ''}`,
    );
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Token: respuesta no JSON (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok || !data.access_token) {
    throw new Error(`Token falló HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data.access_token;
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function fetchListasIds(token) {
  const url = joinUrl(API_BASE, 'api/List/GetListas');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GetListas HTTP ${res.status}: ${text.slice(0, 400)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GetListas no JSON: ${text.slice(0, 400)}`);
  }
  const ids = new Set();
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    const id = o.id ?? o.Id;
    if (typeof id === 'number' && id > 0) ids.add(id);
    if (typeof id === 'string' && /^\d+$/.test(id)) ids.add(Number(id));
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v);
    }
  }
  walk(data);
  return [...ids].sort((a, b) => a - b);
}

async function main() {
  if (!TOKEN_URL || !USERNAME || !PASSWORD || !API_BASE) {
    console.error(
      'Faltan variables: AGILECHECK_TOKEN_URL, AGILECHECK_USERNAME, AGILECHECK_PASSWORD, AGILECHECK_API_BASE\n\n' +
        'Causas habituales:\n' +
        '  • Las líneas en .env empiezan con # (comentario): quitá el # en las variables que quieras usar.\n' +
        '  • El archivo está en otro sitio: el script lee solo:\n' +
        `      ${envFile}\n` +
        `      ${envLocal}\n` +
        '  • O exportá las variables en la terminal antes de npm run test:agilecheck-buscar\n',
    );
    process.exit(1);
  }

  console.log('1) Obteniendo token…');
  const token = await getToken();
  console.log('   OK (token recibido)\n');

  let listaIds;
  if (LISTA_IDS_RAW) {
    listaIds = LISTA_IDS_RAW.split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    console.log('2) Listas desde AGILECHECK_LISTA_IDS:', listaIds);
  } else {
    console.log('2) AGILECHECK_LISTA_IDS vacío → GET api/List/GetListas …');
    listaIds = await fetchListasIds(token);
    console.log('   IDs detectados:', listaIds);
  }

  if (!listaIds?.length) {
    console.error('\nNo hay IDs de listas. Define AGILECHECK_LISTA_IDS en .env.local o revisa la respuesta de GetListas.');
    process.exit(1);
  }

  const payload = {
    Nombres: TEST_NOMBRES,
    Apellidos: TEST_APELLIDOS,
    EsJuridico: TEST_ES_JURIDICO,
    Listas: listaIds,
    Pais: PAIS_ID === 0 ? '' : PAIS,
    PaisId: PAIS_ID,
    queryMode: QUERY_MODE,
  };
  if (TEST_NUMERO_ID) payload.NumeroId = TEST_NUMERO_ID;

  const buscarUrl = joinUrl(API_BASE, 'api/Consulta/Buscar');
  console.log('\n3) POST', buscarUrl);
  console.log('   Body:', JSON.stringify(payload, null, 2));

  const res = await fetch(buscarUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('\n4) HTTP', res.status);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2).slice(0, 12000));
    if (JSON.stringify(json).length > 12000) console.log('\n…(truncado en consola)');
  } catch {
    console.log(text.slice(0, 4000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

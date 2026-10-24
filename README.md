# PadelHub (app)

Next.js 16 + TypeScript + Drizzle + Neon Postgres. Diseño: [`../docs/system-design.md`](../docs/system-design.md).

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm test` | tests (Postgres en memoria con PGlite, incluye aislamiento entre clubes) |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` | genera migración desde `src/server/db/schema.ts` |
| `npm run db:migrate` | aplica migraciones a Neon (usa `DATABASE_URL_MIGRATE`) |

## Base de datos
- Esquema: `src/server/db/schema.ts`. RLS, roles y grants: `drizzle/0001_rls.sql` (SQL a mano).
- Roles: `app_user` (rutas del club, RLS siempre) y `platform_user` (auth, superadmin, jobs). La migración los crea `NOLOGIN`; hay que darles login y clave una vez: `ALTER ROLE app_user LOGIN PASSWORD '...'`.
- Todo acceso a datos pasa por `withTenant(clubId, fn)` o `withPlatform(fn)` (`src/server/db/client.ts`).
- Toda tabla nueva con `club_id` necesita en su migración: `ENABLE ROW LEVEL SECURITY`, policy `tenant_isolation`, policy `platform_all` y `GRANT`s. Agregar un test en `tests/tenant-isolation.test.ts`.
- Variables de entorno: ver `.env.example`.

## i18n
`next-intl`, idiomas `es`, `en`, `pt` (`messages/*.json`, URL con prefijo `/es`, `/en`, `/pt`). Un test falla si falta una clave en algún idioma.

## Auth (JWT)
- Servicio: `src/server/auth/service.ts` (login, refresh rotativo, logout, cambio de club). Endpoints: `/api/auth/{login,refresh,logout,switch-club}`.
- Access token JWT de 15 min en cookie `ph_at`; refresh opaco de 30 días en `ph_rt` (path `/api/auth`, solo se guarda su hash). Cada refresh rota el token; reusar uno viejo revoca toda la sesión.
- `src/proxy.ts` es un guard optimista (firma y vencimiento). La autorización real: `requireClubSession()`, `requireOwner()`, `requireSuperadmin()` en las páginas y `withTenant()` en los datos.
- Requiere `JWT_SECRET` (32+ caracteres).
- Pendiente: invitación y reset de contraseña por email (tabla `auth_tokens` ya existe), CSP con nonce, 2FA de superadmin.

## Neon (proyecto `padel'hub`, rama `production`)
Puesta en marcha desde cero, en orden:
1. `.env.local` con `DATABASE_URL_MIGRATE` (conexión directa del dueño; `neon connection-string --project-id <id> --role-name neondb_owner`).
2. `npm run db:migrate`
3. `npm run ops:setup-env`: da login a `app_user` y `platform_user`, y completa `DATABASE_URL`, `DATABASE_URL_PLATFORM` y `JWT_SECRET` (usa `--rotate` para regenerarlos).
4. `npm run ops:smoke` y `npm run ops:smoke-auth`: pruebas contra la base real; crean datos temporales y los borran.
5. Primer superadmin y primer club (alta manual del MVP). Se llama a `tsx` directo porque PowerShell se come el `--` de `npm run`:
   - `npx tsx --conditions=react-server scripts/create-superadmin.ts --email <email> --name "<nombre>" --password "<clave>"`
   - `npx tsx --conditions=react-server scripts/create-club.ts --slug <slug> --name "<nombre>" --owner-email <email> --owner-name "<nombre>" --password "<clave>" [--locale es|en|pt]`

`.env.local` no se versiona. En Vercel hay que cargar `DATABASE_URL`, `DATABASE_URL_PLATFORM` y `JWT_SECRET` (nunca `DATABASE_URL_MIGRATE`).

## Entornos de base de datos
- `.env.local` apunta a la rama **`dev`** de Neon (datos de prueba, incluido el club `demo-padel`: `npx tsx --conditions=react-server scripts/seed-demo.ts --password "<clave>"`).
- Las conexiones de la rama `production` están en `.env.neon-production` (a propósito con un nombre que Next **no** carga solo; antes se llamaba `.env.production.local` y `next start` lo habría usado). Esos valores se cargan en Vercel, no se copian a `.env.local`.

## Módulo de jugadores (`/[locale]/app/players`)
Listado con búsqueda y filtros (categoría, género, posición, horario) en la URL, alta manual con consentimiento, ficha editable y baja (solo dueño). Responsive: tabla en pantallas ≥1280px, tarjetas en 2 columnas en tablet, 1 columna con filtros plegables en celular. Servicio: `src/server/services/players.ts`.

## Despliegue
Producción (`main`) y desarrollo (`dev`) en Vercel + Neon: ver [`DEPLOY.md`](DEPLOY.md).

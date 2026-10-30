@AGENTS.md

# PadelHub (app)

SaaS multi-club para clubes de pádel: base ordenada de jugadores (categoría 1–8, posición, horarios, contacto), búsqueda y contacto por WhatsApp. Desarrollado por **Duxio**. Contexto de producto y diseño completo: `../docs/system-design.md` (leerlo antes de decidir arquitectura) y `../PadelHub_prompt_inicial.md`.

## Alcance
- **MVP en curso:** módulo de jugadores (hecho), alta pública por link/tablet, "Falta el cuarto", panel superadmin, usuarios del club (invitación/reset), CSV, marca del club. Eventos y ligas después.
- **Post-MVP, no construir todavía:** suscripciones y pagos (Mercado Pago / Stripe), facturación ARCA, avisos por la API de WhatsApp. Los clubes se dan de alta a mano (`scripts/create-club.ts`). `clubs.status` y `clubs.plan_id` ya dejan el lugar.
- `../padel_demo` es el prototipo viejo (Notion + Netlify). Es solo referencia: **no se toca**, y Notion no se usa.

## Comandos
```bash
npm run dev          # servidor de desarrollo
npm test             # vitest (Postgres en memoria con PGlite; ~10 s)
npm run typecheck    # tsc --noEmit
npm run lint
npm run db:generate  # migración desde src/server/db/schema.ts
npm run db:migrate   # aplica a Neon (usa DATABASE_URL_MIGRATE de .env.local = rama dev)
# Toda herramienta de base (db:migrate, scripts/*) obedece ENV_FILE: sin definir = dev; ENV_FILE=.env.neon-production = PRODUCCIÓN.
# Cada script imprime el host de la base antes de actuar: revisarlo antes de seguir.
```
Antes de dar algo por terminado: `npm run typecheck && npm run lint && npm test`, y `npx next build` si tocaste rutas o configuración.

Scripts de operación (`scripts/`): se corren con `tsx` directo, **no** con `npm run x -- --flag` (PowerShell se come el `--`), y con `--conditions=react-server` si importan módulos `server-only`:
```bash
npx tsx --conditions=react-server scripts/create-club.ts --slug ... --name "..." --owner-email ... --owner-name "..." --password "..."
npx tsx --conditions=react-server scripts/create-superadmin.ts --email ... --name "..." --password "..."
npx tsx --conditions=react-server scripts/seed-demo.ts --password "..."   # club demo, solo en dev
npm run ops:smoke / ops:smoke-auth   # pruebas de humo contra la base real; crean y borran sus datos
```

## Stack
Next.js 16 (App Router, `cacheComponents` activado) · TypeScript · Tailwind v4 · Drizzle ORM · Neon Postgres (driver `@neondatabase/serverless`) · next-intl · Zod · jose (JWT) · argon2id (`@node-rs/argon2`) · Vitest. Deploy previsto: Vercel (región `iad1`, cerca de Neon us-east-2).

## Next.js 16: no es el que conocés
Leer `node_modules/next/dist/docs/` antes de usar una API. Lo que ya nos mordió:
- `middleware` se llama **`proxy`** (`src/proxy.ts`), corre en Node.
- Con `cacheComponents`, todo acceso a datos dinámicos (cookies, `searchParams`, base) tiene que estar dentro de `<Suspense>`. Patrón del repo: la página exporta un wrapper fino que hace `setRequestLocale` y renderiza un componente async dentro de `<Suspense>`.
- Tipos globales `PageProps<"/[locale]/...">` y `LayoutProps<...>`; `params` y `searchParams` son Promises.
- `refresh()` de `next/cache` (solo en server actions) refresca el router tras una mutación.

## Arquitectura
```
src/
  proxy.ts                 i18n + guard OPTIMISTA de /app y /admin (solo firma/vencimiento del JWT)
  app/[locale]/            (marketing)/ = landing pública en /es|/en|/pt, login, app/ (panel del club), admin/ (superadmin)
  app/api/auth/            login, refresh, logout, switch-club
  server/
    db/schema.ts           esquema Drizzle · tenant.ts (withTenant/withPlatform) · client.ts (Neon, server-only)
    auth/                  service.ts (lógica), jwt.ts, password.ts, session.ts (requireXxx), http.ts (cookies, CSRF)
    services/              reglas de negocio; reciben el `tx` y no conocen HTTP
    club-context.ts        sesión + club activo, una consulta por request
  lib/                     código compartido cliente/servidor (phone.ts, player-schema.ts)
  components/              UI compartida (ui.ts = clases, app-nav, language-switcher…) · landing/ (secciones de la landing)
  i18n/ · messages/{es,en,pt}.json
drizzle/                   migraciones (0000 = tablas, 0001 = roles/RLS/grants, a mano)
tests/                     vitest; helpers.ts levanta PGlite con las migraciones reales
scripts/                   operación contra Neon (leen .env.local)
```
Regla de capas: la UI no consulta la base. Páginas y server actions llaman a `services/` dentro de `withTenant()`/`withPlatform()`.

## Multi-tenancy y seguridad (lo más importante del repo)
- Un solo schema; toda tabla de negocio lleva `club_id`. **Row Level Security** es la segunda barrera: la app conecta como `app_user` (sin BYPASSRLS) y `withTenant(clubId, fn)` abre una transacción con `app.club_id`. Auth, superadmin y jobs usan `withPlatform()` (rol `platform_user`).
- `clubId` sale **siempre de la sesión** (`requireClubSession()`), nunca de un parámetro o formulario.
- Tabla nueva con `club_id` ⇒ en su migración: `ENABLE ROW LEVEL SECURITY`, policy `tenant_isolation`, policy `platform_all`, `GRANT`s a `app_user`/`platform_user`, FK compuesta `(id, club_id)` si referencia otra tabla del club, **y un test** en `tests/tenant-isolation.test.ts`. Nunca `FORCE ROW LEVEL SECURITY` (bloquearía las migraciones).
- `app_user` no lee `password_hash`, `refresh_tokens`, `auth_tokens`, `rate_limits` y no puede cambiar `slug`/`status`/`plan_id` del club.
- Auth: access JWT 15 min (`ph_at`) + refresh opaco rotativo 30 días (`ph_rt`, solo se guarda el hash). Reusar un refresh viejo revoca la familia; hay ventana de 10 s para pestañas simultáneas. El refresh re-verifica usuario, membresía, rol y estado del club en la base. Mutaciones por API exigen `Origin` propio.
- Autorización real en cada página/acción (`requireClubSession`, `requireOwner`, `requireSuperadmin`); el proxy es solo una comodidad. Permisos que validamos en el servidor, no en la UI: **solo el dueño borra jugadores, exporta CSV y gestiona usuarios**.
- Entradas siempre con Zod (`src/lib/player-schema.ts` es el modelo). Teléfonos en E.164 con `libphonenumber-js` (país del club); para `wa.me` usar `whatsappLink()` (en Argentina agrega el 9).
- Nunca imprimir ni commitear secretos. `.env*` está ignorado.

## Dominio
- Roles de club: `owner` y `staff`; `users.is_superadmin` aparte. Un usuario puede pertenecer a varios clubes.
- Categoría = solo el **nivel, del 1 al 8** (`players.category`, `smallint`, nulo = sin categoría). **No hay tabla de categorías ni rama**: hombre o mujer es el `gender` del jugador, y se busca por categoría y género. Constante `CATEGORIES` en `src/lib/player-schema.ts`; etiquetas con `categoryLabel(t, level)` y selectores con `categoryOptions(t)`.
- Jugadores independientes entre clubes; teléfono único por club; baja lógica (`deleted_at`). Datos esenciales: nombre, apellido, género, categoría, posición, horarios, teléfono; opcionales: foto, Instagram.
- Consentimiento (Ley 25.326) registrado en `player_consents` con versión e idioma; textos en `../docs/consent-text.md` (borrador, falta revisión legal).

## i18n (es, en, pt desde el día uno)
- Cero texto fijo en componentes: todo en `messages/*.json`. Un test falla si las claves de los tres idiomas difieren.
- Códigos en la base (`drive`, `manana`, `caballeros`…), traducidos al mostrar. Etiqueta de categoría con `categoryLabel()`; los ordinales por idioma (1ra, 4ta, 7ma, 8va) salen de un ICU `select` en `category.name`.
- Textos de interfaz en español rioplatense (voseo: "Probá", "Elegí"). Código, identificadores y commits en inglés o español consistente con el archivo; comentarios en español.
- Panel: idioma por `users.locale` → `clubs.locale`. Alta pública: idioma en la URL con selector.

## Responsive: siempre los tres tamaños
Toda vista nueva se diseña y se **verifica** en escritorio, tablet y celular (herramienta de navegador: `resize_window` con `1440x900`, `tablet` 768 y `mobile` 375; volver a `desktop` al terminar).
- Convención: celular <640px (1 columna, controles ≥44px de alto), tablet 640–1279px (2 columnas, con barra lateral desde `lg`), escritorio ≥1280px (`xl`: tablas completas). Una tabla ancha se reemplaza por tarjetas por debajo de `xl`.
- Filtros plegables en celular, visibles en tablet/escritorio. Acciones primarias fijas abajo en formularios largos de celular.
- Clases compartidas en `src/components/ui.ts`. Colores = tokens semánticos de `globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-accent`…); el modo oscuro (solo con `<html data-theme="dark">`; por defecto la app es siempre clara, sin seguir al sistema) cambia los valores de las variables, así que **no se usa `dark:`** ni colores `zinc-*`/`emerald-*` sueltos.
- Movimiento: `enter` (subir y aparecer) en la raíz del contenido de cada página y `style={stagger(i)}` en listas; `skeleton` en los fallbacks de `<Suspense>` (`components/skeleton.tsx`). Se respeta `prefers-reduced-motion`. No animar cada elemento: un solo gesto por vista.
- Pie de página "Desarrollado por Duxio" en el panel.

## Base de datos y entornos
- **Neon, proyecto `padel'hub`**: rama `production` (nada de datos de prueba) y rama `dev` (la que usa `.env.local`; tiene el club `demo-padel`).
- Las conexiones de producción están en `.env.neon-production`, con ese nombre a propósito: Next carga solo `.env.production.local` en `next start`/`build`, y eso apuntaría pruebas locales a producción. No renombrar.
- `DATABASE_URL` (app_user, pooled) · `DATABASE_URL_PLATFORM` (platform_user, pooled) · `DATABASE_URL_MIGRATE` (dueño, directa, solo migraciones y scripts) · `JWT_SECRET` (32+ caracteres). En Vercel van las tres primeras; nunca `DATABASE_URL_MIGRATE`.
- Cambios de esquema: editar `schema.ts` → `npm run db:generate` → revisar el SQL → probar en `dev` → recién después `production`. Lo que Drizzle no genera (extensiones, RLS, grants, funciones) va en migraciones SQL a mano (`drizzle-kit generate --custom`).
- Credenciales del club demo (solo en `dev`, datos ficticios): dueño `demo@padelhub.com` y empleado `empleado@demo.padelhub.dev`, clave `demo-padel-2026` (verificado contra la base `dev`; si cambian, el usuario real se ve con una consulta a `users`).

## Logo del club
Se sube en Ajustes > Marca (solo el dueño). El archivo se valida por sus bytes y se **vuelve a codificar a WebP de hasta 512 px en el servidor** (`src/server/logo-image.ts`, con `sharp`): nunca se guarda ni se sirve el original (sin SVG ni GIF, sin metadatos). Vive en la tabla `club_logos` (bytea, RLS por club) y `clubs.logo_url` guarda la URL pública versionada `/api/logo/<slug>?v=...`, que sirve la ruta pública con caché inmutable. Se muestra con `<ClubMark>` (logo o iniciales) en el formulario público y en el panel.

## Pruebas
- Los tests corren contra PGlite con las migraciones reales y simulan los roles con `SET LOCAL ROLE`, así RLS y grants se prueban de verdad. Cada servicio nuevo necesita tests de aislamiento entre clubes además de los felices.
- Para ver la UI de verdad: levantar el servidor, entrar con el club demo y revisar los tres tamaños. Un build de producción local (`next build && next start -p 3100`) es independiente del `next dev` que pueda tener abierto el usuario, pero **`rm -rf .next` rompe un `next dev` en marcha**: avisar.

## Despliegue
Dos ambientes: **main → Vercel Production → rama `production` de Neon** y **dev → Vercel Preview → rama `dev` de Neon**. Procedimiento completo, variables y rollback: `DEPLOY.md`. Reglas: nunca subir `DATABASE_URL_MIGRATE` a Vercel; migrar producción **antes** de mergear a `main`; los cambios que rompen el código anterior (borrar/renombrar columnas) van en dos releases; producción y desarrollo no comparten claves (`npm run ops:vercel-env` lo verifica). Nunca correr scripts de alta o pruebas contra producción sin querer: confirmar el host que imprimen.

## Trabajo con Git
El repositorio git está dentro de `app/` (lo creó `create-next-app`); `docs/` y `padel_demo/` quedan afuera. No commitear ni pushear sin que se pida.

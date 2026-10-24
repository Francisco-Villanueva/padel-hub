# Despliegue: producción y desarrollo

Dos ambientes completamente separados (base, claves y URL):

| | **Producción** | **Desarrollo** |
|---|---|---|
| Rama de Git | `main` | `dev` |
| Vercel | Production | Preview (la rama `dev`) |
| Base (Neon, proyecto `padel'hub`) | rama `production` | rama `dev` |
| Variables | `.env.vercel.production` | `.env.vercel.preview` |
| Datos | reales | de prueba (incluye el club `demo-padel`) |
| Quién entra | público | protegido por Vercel (login de Vercel) |

Flujo de trabajo: se desarrolla en ramas que salen de `dev` → PR a `dev` (se prueba en el Preview) → cuando está bien, PR de `dev` a `main` (sale a producción).

## 1. Estado de las bases (ya hecho)
- **Producción:** migraciones 0000–0003 aplicadas, clave de los roles `app_user` y `platform_user` **rotadas** (distintas de las de desarrollo) y `JWT_SECRET` propio. Sin clubes ni jugadores; existe el superadmin.
- **Desarrollo:** rama `dev` de Neon con los datos de prueba.

Nada de esto se repite; solo hace falta migrar en cada release (sección 5).

## 2. Git y GitHub
El repositorio es la carpeta `app/`. Falta crear el repo remoto y subir las dos ramas:
```bash
git branch -M main          # la rama inicial se llamaba master
git checkout -b dev         # si todavía no existe
git add -A && git commit -m "..."      # lo que corresponda
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
git push -u origin dev
```
En GitHub: proteger `main` (Settings → Branches → exigir PR y que pase el check **CI**). El workflow `.github/workflows/ci.yml` corre build, typecheck, lint y tests en cada push y PR; no usa Neon.

## 3. Vercel (una sola vez)
1. **Add New → Project** → importar el repo.
2. **Framework:** Next.js (se detecta). **Root Directory:** `./` (el repo ya es `app/`). Build y Install: por defecto. Node 22 sale de `engines` en `package.json`. La región de las funciones (`iad1`, cerca de Neon us-east-2) sale de `vercel.json`.
3. **Settings → Git → Production Branch:** `main`.
4. **Settings → Environment Variables → Import .env**
   - `.env.vercel.production` → marcar **solo Production**.
   - `.env.vercel.preview` → marcar **Preview** y **Development**.

   Para regenerar esos archivos: `npm run ops:vercel-env` (lee `.env.neon-production` y `.env.local`, y se niega a generar si ambos ambientes comparten base o claves). Ambos quedan fuera de git.
5. **Settings → Deployment Protection:** dejar **Vercel Authentication** activa para Preview (la rama `dev` tiene credenciales de demo). Producción pública.
6. **Dominios** (cuando los tengas): `app.<tu-dominio>` → Production; `dev.<tu-dominio>` → asignado a la rama Git `dev`. Sin dominio propio, la URL estable de desarrollo es `https://<proyecto>-git-dev-<equipo>.vercel.app`.

Variables en Vercel (las **tres** y nada más):

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | conexión pooled del rol `app_user` (RLS siempre activa) |
| `DATABASE_URL_PLATFORM` | conexión pooled del rol `platform_user` (login, superadmin) |
| `JWT_SECRET` | 32+ caracteres; distinto en cada ambiente (cambiarlo cierra todas las sesiones) |

**`DATABASE_URL_MIGRATE` no se sube nunca a Vercel.** Las variables de Vercel también llegan a las funciones en ejecución, y el dueño de las tablas saltea RLS: si se filtrara, se perdería el aislamiento entre clubes.

## 4. Primera puesta en marcha de producción
> **Todos los comandos de este documento se corren desde la carpeta `app/`** (donde está `package.json`). Desde la carpeta de arriba falla con `Cannot find module ...scripts/...`.

Con `ENV_FILE` se elige la base sobre la que operan los scripts y las migraciones; sin definir usa `.env.local` (desarrollo). Cada script imprime el host de la base antes de actuar: confirmalo.

PowerShell:
```powershell
$env:ENV_FILE = ".env.neon-production"
npx tsx --conditions=react-server scripts/create-superadmin.ts --email <tu-email> --name "<nombre>" --password "<clave nueva>"
npx tsx --conditions=react-server scripts/create-club.ts --slug <slug> --name "<club>" --owner-email <email> --owner-name "<nombre>" --password "<clave>" --locale es --country AR
Remove-Item Env:ENV_FILE
```
Bash: `ENV_FILE=.env.neon-production npx tsx ...`.

- La clave del superadmin que existe hoy en producción es la que se usó en desarrollo: **volvé a ejecutar `create-superadmin` con una clave nueva** antes de salir.
- Después del primer deploy: `ENV_FILE=.env.neon-production npm run ops:smoke` (crea y borra sus datos) comprueba el aislamiento entre clubes con los roles reales.

## 5. Cómo se despliega un cambio

**A desarrollo (`dev`)**
1. `npm run db:migrate` (migra la rama `dev` de Neon, usa `.env.local`).
2. Merge/push a `dev` → Vercel despliega el Preview solo.

**A producción (`main`)**
1. Si hay migraciones nuevas: crear un respaldo instantáneo (copy-on-write, no cuesta casi nada):
   `neon branches create --project-id shiny-voice-32316561 --parent production --name pre-release-AAAAMMDD`
2. Migrar producción **antes** de mergear:
   `ENV_FILE=.env.neon-production npm run db:migrate` (PowerShell: `$env:ENV_FILE=".env.neon-production"; npm run db:migrate`).
3. PR `dev` → `main` y merge → Vercel despliega a Production.

Por qué migrar primero: en el instante entre migrar y desplegar, el código viejo corre contra el esquema nuevo. Los cambios que rompen el código anterior (borrar o renombrar columnas, como pasó con `categories`) se hacen en **dos releases**: primero se agrega lo nuevo y se despliega el código que lo usa; recién en el release siguiente se borra lo viejo.

## 6. Después de cada deploy (2 minutos)
- `/es/login` carga y se puede entrar.
- Las cookies `ph_at` y `ph_rt` llevan `Secure` y `HttpOnly`.
- `curl -I <url>` muestra HSTS, `X-Frame-Options: DENY` y la CSP.
- Un `?next=//malo.com` en `/api/auth/refresh` no redirige afuera.
- En Vercel → Logs: sin errores de conexión a Neon.

## 7. Volver atrás
- **Código:** Vercel → Deployments → el deploy anterior → **Instant Rollback**.
- **Datos:** Neon → Backup & Restore (retención según el plan), o la rama `pre-release-…` del paso 5.1.

## 8. Rotar claves
```powershell
$env:ENV_FILE = ".env.neon-production"      # o sin definir, para desarrollo
npx tsx scripts/setup-env.ts --rotate        # nuevas claves de los roles y nuevo JWT_SECRET
npm run ops:vercel-env                       # regenera los archivos de Vercel
```
Después actualizar las variables en Vercel y redeployar. Quien tenga una sesión abierta deberá volver a entrar.
La clave del dueño de las tablas (`neondb_owner`) solo se cambia desde la consola de Neon; después actualizar `DATABASE_URL_MIGRATE` en el archivo local.

## 9. Pendiente antes de abrir al público
- Dominio propio y, con él, el email de soporte/contacto del club.
- Envío de emails (invitaciones y reset de contraseña): todavía no existe, los usuarios se crean con clave inicial.
- Suscripciones, pagos y facturación (post-MVP).
- Revisión legal del texto de consentimiento (`docs/consent-text.md`).

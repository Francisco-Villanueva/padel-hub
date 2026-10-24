-- Roles, grants y Row Level Security (docs/system-design.md, sección 4).
--
-- app_user      : lo usa la app en las rutas del club. RLS aplica siempre.
-- platform_user : lo usan auth, superadmin y jobs. Ve todos los clubes.
-- Los roles se crean NOLOGIN; quien opera la base les asigna login y clave fuera del repo:
--   ALTER ROLE app_user LOGIN PASSWORD '...';  ALTER ROLE platform_user LOGIN PASSWORD '...';
-- No se usa FORCE ROW LEVEL SECURITY a propósito: el dueño de las tablas (migraciones) no debe quedar bloqueado.
-- Toda tabla nueva con club_id necesita en su migración: ENABLE RLS, policy tenant_isolation, policy platform_all y GRANT.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_user') THEN CREATE ROLE platform_user NOLOGIN; END IF;
END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_user, platform_user;--> statement-breakpoint

-- platform_user: acceso total, filtrado por policies "platform_all" ------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_user;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO platform_user;--> statement-breakpoint

-- app_user: solo lo que necesita una ruta de club --------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON categories, players, player_consents, signup_links, contact_log, events, event_invites, club_members TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO app_user;--> statement-breakpoint
GRANT SELECT ON clubs TO app_user;--> statement-breakpoint
-- el club no puede cambiar slug, status ni plan
GRANT UPDATE (name, timezone, locale, contact_email, logo_url, color_primary, color_accent, updated_at) ON clubs TO app_user;--> statement-breakpoint
-- users: sin password_hash ni contadores de login
GRANT SELECT (id, email, name, locale, is_superadmin, disabled_at, created_at) ON users TO app_user;--> statement-breakpoint

-- Habilitar RLS ---------------------------------------------------------------------------------------
ALTER TABLE clubs           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE club_members    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE players         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE player_consents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE signup_links    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contact_log     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE event_invites   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Sin grants para app_user: refresh_tokens, auth_tokens, rate_limits. Igual se cierran con RLS y sin policies.
ALTER TABLE refresh_tokens  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE auth_tokens     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE rate_limits     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Policies de aislamiento por club: club_id = app.club_id (si no está seteado, no se ve nada) -------------
CREATE POLICY tenant_isolation ON clubs TO app_user
  USING (id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON club_members TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON categories TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON players TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON player_consents TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON signup_links TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON contact_log TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON events TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON event_invites TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint

-- users: un club solo ve a sus propios miembros (la subconsulta ya viene filtrada por RLS de club_members)
CREATE POLICY tenant_members ON users FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM club_members m WHERE m.user_id = users.id));--> statement-breakpoint

-- Policies de plataforma ------------------------------------------------------------------------------------
CREATE POLICY platform_all ON clubs           TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON users           TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON club_members    TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON categories      TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON players         TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON player_consents TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON signup_links    TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON contact_log     TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON events          TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON event_invites   TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON audit_log       TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON refresh_tokens  TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON auth_tokens     TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_all ON rate_limits     TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint

-- Consultas públicas pre-tenant (alta de jugadores): SECURITY DEFINER, devuelven solo lo mínimo -------------------
CREATE FUNCTION public_club_by_slug(p_slug text)
RETURNS TABLE (id uuid, slug text, name text, locale text, country text, logo_url text, color_primary text, color_accent text, status club_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.locale, c.country, c.logo_url, c.color_primary, c.color_accent, c.status
  FROM clubs c WHERE c.slug = p_slug
$$;--> statement-breakpoint

CREATE FUNCTION resolve_signup_link(p_slug text, p_token text)
RETURNS TABLE (club_id uuid, kind player_source)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, l.kind
  FROM signup_links l JOIN clubs c ON c.id = l.club_id
  WHERE c.slug = p_slug AND l.token = p_token AND l.active AND c.status = 'active'
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public_club_by_slug(text), resolve_signup_link(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_club_by_slug(text), resolve_signup_link(text, text) TO app_user, platform_user;

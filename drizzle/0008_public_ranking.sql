-- Ranking público del club (/c/<slug>/ranking). Funciones SECURITY DEFINER, como public_club_by_slug (ver 0001):
-- la página pública nunca consulta las tablas; cada función comprueba que el club esté activo y tenga la función `tournaments`
-- habilitada (si no, no devuelve nada) y expone solo lo mínimo: nombre de pila, inicial del apellido, categoría y puntos.
-- Nunca teléfono, Instagram ni ningún dato de contacto.
CREATE FUNCTION public_ranking_club(p_slug text)
RETURNS TABLE (id uuid, slug text, name text, locale text, logo_url text, color_primary text, color_accent text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.locale, c.logo_url, c.color_primary, c.color_accent
  FROM clubs c
  WHERE c.slug = p_slug AND c.status = 'active'
    AND EXISTS (SELECT 1 FROM club_features f WHERE f.club_id = c.id AND f.feature = 'tournaments' AND f.enabled)
$$;--> statement-breakpoint

CREATE FUNCTION public_ranking_buckets(p_slug text)
RETURNS TABLE (rule_kind text, rule_value smallint, modality text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT e.category_rule_kind, e.category_rule_value, e.modality
  FROM ranking_events e JOIN public_ranking_club(p_slug) c ON c.id = e.club_id
  ORDER BY 1, 2, 3
$$;--> statement-breakpoint

-- p_since = inicio de la ventana (inclusive); null = histórico. Empate en puntos = misma posición.
CREATE FUNCTION public_ranking(p_slug text, p_kind text, p_value smallint, p_modality text, p_since date)
RETURNS TABLE (rank_pos int, first_name text, last_initial text, category smallint, points int, tournaments int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (rank() OVER (ORDER BY sum(e.points) DESC))::int, p.first_name, upper(left(p.last_name, 1)), p.category,
         sum(e.points)::int, count(*)::int
  FROM ranking_events e
  JOIN public_ranking_club(p_slug) c ON c.id = e.club_id
  JOIN players p ON p.id = e.player_id AND p.club_id = e.club_id AND p.deleted_at IS NULL
  WHERE e.category_rule_kind = p_kind AND e.category_rule_value = p_value AND e.modality = p_modality
    AND (p_since IS NULL OR e.tournament_ended_on >= p_since)
  GROUP BY p.id, p.first_name, p.last_name, p.category
  ORDER BY 1, p.last_name, p.first_name, p.id
  LIMIT 200
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public_ranking_club(text), public_ranking_buckets(text), public_ranking(text, text, smallint, text, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_ranking_club(text), public_ranking_buckets(text), public_ranking(text, text, smallint, text, date) TO app_user, platform_user;

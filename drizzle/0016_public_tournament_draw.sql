-- Vista pública del torneo: zonas (posiciones) y cuadro de cruces, de solo lectura. Mismas reglas que el tablero (ver 0011):
-- SECURITY DEFINER, club activo, función `tournaments` habilitada y torneo en juego o cerrado; si no, no devuelven nada.
-- Solo apellidos, zona, horario, estado y resultado. Las parejas se identifican con un número propio de la consulta (`entry_ref`,
-- en el mismo orden que sus ids), no con el id de la base. Son funciones nuevas: no cambian nada de lo que ya existe.
CREATE FUNCTION public_tournament_pairs(p_slug text, p_id uuid)
RETURNS TABLE (entry_ref int, pair_name text, zone_position smallint, zone_name text, zone_size smallint, draw_position int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (
    SELECT t.id, t.club_id FROM tournaments t
    JOIN public_ranking_club(p_slug) pc ON pc.id = t.club_id
    WHERE t.id = p_id AND t.status IN ('zonas', 'llave', 'cerrado')
  ), refs AS (
    SELECT e.*, (row_number() OVER (ORDER BY e.id))::int AS ref
    FROM tournament_entries e JOIN t ON t.id = e.tournament_id AND t.club_id = e.club_id
  )
  SELECT e.ref, p1.last_name || ' / ' || p2.last_name, z."position", z.name, z.size,
         (SELECT d.n::int FROM jsonb_array_elements_text(z.tie_draw -> 'order') WITH ORDINALITY AS d(v, n) WHERE d.v = e.id::text LIMIT 1)
  FROM refs e
  JOIN players p1 ON p1.id = e.player1_id AND p1.club_id = e.club_id
  JOIN players p2 ON p2.id = e.player2_id AND p2.club_id = e.club_id
  LEFT JOIN tournament_zones z ON z.id = e.zone_id AND z.club_id = e.club_id
  WHERE e.status = 'inscripta'
  ORDER BY z."position" NULLS LAST, e.ref
$$;--> statement-breakpoint

-- Todos los partidos, también los libres (el cuadro los necesita). `source_a/b` = "zona:puesto" del lugar sin definir; en la 2ª ronda,
-- el origen del cruce libre que lo alimenta (ver 0014).
CREATE FUNCTION public_tournament_matches(p_slug text, p_id uuid)
RETURNS TABLE (stage text, zone_position smallint, round smallint, match_position smallint, scheduled_at timestamptz, status text,
               ref_a int, ref_b int, sets jsonb, winner text, source_a text, source_b text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (
    SELECT t.id, t.club_id FROM tournaments t
    JOIN public_ranking_club(p_slug) pc ON pc.id = t.club_id
    WHERE t.id = p_id AND t.status IN ('zonas', 'llave', 'cerrado')
  ), refs AS (
    SELECT e.id, (row_number() OVER (ORDER BY e.id))::int AS ref
    FROM tournament_entries e JOIN t ON t.id = e.tournament_id AND t.club_id = e.club_id
  )
  SELECT m.stage, z."position", m.round, m."position", m.scheduled_at, m.status, ea.ref, eb.ref, m.sets,
         CASE WHEN m.winner_entry_id IS NULL THEN NULL WHEN m.winner_entry_id = m.entry_a_id THEN 'a' ELSE 'b' END,
         coalesce(m.source_a, fa.source_a), coalesce(m.source_b, fb.source_a)
  FROM tournament_matches m
  JOIN t ON t.id = m.tournament_id AND t.club_id = m.club_id
  LEFT JOIN tournament_zones z ON z.id = m.zone_id AND z.club_id = m.club_id
  LEFT JOIN tournament_matches fa ON fa.next_match_id = m.id AND fa.next_slot = 'a' AND fa.status = 'bye' AND fa.club_id = m.club_id
  LEFT JOIN tournament_matches fb ON fb.next_match_id = m.id AND fb.next_slot = 'b' AND fb.status = 'bye' AND fb.club_id = m.club_id
  LEFT JOIN refs ea ON ea.id = m.entry_a_id
  LEFT JOIN refs eb ON eb.id = m.entry_b_id
  ORDER BY m.stage DESC, z."position" NULLS LAST, m.round, m."position"
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public_tournament_pairs(text, uuid), public_tournament_matches(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_tournament_pairs(text, uuid), public_tournament_matches(text, uuid) TO app_user, platform_user;

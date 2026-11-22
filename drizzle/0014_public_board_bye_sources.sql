-- Tablero público: un lugar de la 2ª ronda que lo ocupa un cruce libre muestra el origen del libre ("1º de la Zona A") mientras la
-- zona no termina, como en la llave de Zonea. Se reemplaza la función (ver 0013); mismas columnas.
CREATE OR REPLACE FUNCTION public_tournament_board(p_slug text, p_id uuid)
RETURNS TABLE (stage text, zone_name text, round smallint, match_position smallint, max_round smallint, scheduled_at timestamptz,
               status text, name_a text, name_b text, sets jsonb, winner text,
               src_a_zone text, src_a_pos smallint, src_b_zone text, src_b_pos smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.stage, z.name, m.round, m."position",
         (SELECT max(x.round) FROM tournament_matches x WHERE x.tournament_id = m.tournament_id AND x.stage = 'llave')::smallint,
         m.scheduled_at, m.status,
         CASE WHEN ea.id IS NULL THEN NULL ELSE a1.last_name || ' / ' || a2.last_name END,
         CASE WHEN eb.id IS NULL THEN NULL ELSE b1.last_name || ' / ' || b2.last_name END,
         m.sets,
         CASE WHEN m.winner_entry_id IS NULL THEN NULL WHEN m.winner_entry_id = m.entry_a_id THEN 'a' ELSE 'b' END,
         CASE WHEN m.entry_a_id IS NULL THEN sa.name END,
         CASE WHEN m.entry_a_id IS NULL AND sa.id IS NOT NULL THEN split_part(coalesce(m.source_a, fa.source_a), ':', 2)::smallint END,
         CASE WHEN m.entry_b_id IS NULL THEN sb.name END,
         CASE WHEN m.entry_b_id IS NULL AND sb.id IS NOT NULL THEN split_part(coalesce(m.source_b, fb.source_a), ':', 2)::smallint END
  FROM tournament_matches m
  JOIN tournaments t ON t.id = m.tournament_id AND t.club_id = m.club_id
  JOIN public_ranking_club(p_slug) pc ON pc.id = t.club_id
  LEFT JOIN tournament_zones z ON z.id = m.zone_id AND z.club_id = m.club_id
  -- Cruces libres que alimentan a este partido: su lugar es el origen que se muestra mientras no haya pareja.
  LEFT JOIN tournament_matches fa ON fa.next_match_id = m.id AND fa.next_slot = 'a' AND fa.status = 'bye' AND fa.club_id = m.club_id
  LEFT JOIN tournament_matches fb ON fb.next_match_id = m.id AND fb.next_slot = 'b' AND fb.status = 'bye' AND fb.club_id = m.club_id
  LEFT JOIN tournament_zones sa ON sa.tournament_id = m.tournament_id AND sa.club_id = m.club_id
         AND coalesce(m.source_a, fa.source_a) ~ '^[0-9]+:[0-9]$' AND sa."position" = split_part(coalesce(m.source_a, fa.source_a), ':', 1)::int
  LEFT JOIN tournament_zones sb ON sb.tournament_id = m.tournament_id AND sb.club_id = m.club_id
         AND coalesce(m.source_b, fb.source_a) ~ '^[0-9]+:[0-9]$' AND sb."position" = split_part(coalesce(m.source_b, fb.source_a), ':', 1)::int
  LEFT JOIN tournament_entries ea ON ea.id = m.entry_a_id AND ea.club_id = m.club_id
  LEFT JOIN players a1 ON a1.id = ea.player1_id AND a1.club_id = m.club_id
  LEFT JOIN players a2 ON a2.id = ea.player2_id AND a2.club_id = m.club_id
  LEFT JOIN tournament_entries eb ON eb.id = m.entry_b_id AND eb.club_id = m.club_id
  LEFT JOIN players b1 ON b1.id = eb.player1_id AND b1.club_id = m.club_id
  LEFT JOIN players b2 ON b2.id = eb.player2_id AND b2.club_id = m.club_id
  WHERE t.id = p_id AND t.status IN ('zonas', 'llave', 'cerrado') AND m.status <> 'bye'
  ORDER BY m.scheduled_at NULLS LAST, m.stage DESC, z."position" NULLS LAST, m.round, m."position"
$$;

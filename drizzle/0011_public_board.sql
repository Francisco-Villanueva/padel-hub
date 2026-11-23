-- Tablero público de un torneo (/c/<slug>/torneo/<id>): pensado para un televisor en el club y para los jugadores.
-- Funciones SECURITY DEFINER, como public_ranking_club (ver 0009): la página nunca consulta las tablas. Cada una exige club activo,
-- función `tournaments` habilitada y que el torneo ya esté en juego o cerrado; si no, no devuelve nada.
-- Expone solo lo necesario: apellidos de la pareja, zona, horario, estado y resultado. Nunca teléfono ni datos de contacto.
CREATE FUNCTION public_tournament_info(p_slug text, p_id uuid)
RETURNS TABLE (name text, status text, modality text, rule_kind text, rule_value smallint, starts_on date, timezone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, t.status, t.modality, t.category_rule_kind, t.category_rule_value, t.starts_on, c.timezone
  FROM tournaments t
  JOIN public_ranking_club(p_slug) pc ON pc.id = t.club_id
  JOIN clubs c ON c.id = t.club_id
  WHERE t.id = p_id AND t.status IN ('zonas', 'llave', 'cerrado')
$$;--> statement-breakpoint

CREATE FUNCTION public_tournament_board(p_slug text, p_id uuid)
RETURNS TABLE (stage text, zone_name text, round smallint, match_position smallint, max_round smallint, scheduled_at timestamptz,
               status text, name_a text, name_b text, sets jsonb, winner text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.stage, z.name, m.round, m."position",
         (SELECT max(x.round) FROM tournament_matches x WHERE x.tournament_id = m.tournament_id AND x.stage = 'llave')::smallint,
         m.scheduled_at, m.status,
         CASE WHEN ea.id IS NULL THEN NULL ELSE a1.last_name || ' / ' || a2.last_name END,
         CASE WHEN eb.id IS NULL THEN NULL ELSE b1.last_name || ' / ' || b2.last_name END,
         m.sets,
         CASE WHEN m.winner_entry_id IS NULL THEN NULL WHEN m.winner_entry_id = m.entry_a_id THEN 'a' ELSE 'b' END
  FROM tournament_matches m
  JOIN tournaments t ON t.id = m.tournament_id AND t.club_id = m.club_id
  JOIN public_ranking_club(p_slug) pc ON pc.id = t.club_id
  LEFT JOIN tournament_zones z ON z.id = m.zone_id AND z.club_id = m.club_id
  LEFT JOIN tournament_entries ea ON ea.id = m.entry_a_id AND ea.club_id = m.club_id
  LEFT JOIN players a1 ON a1.id = ea.player1_id AND a1.club_id = m.club_id
  LEFT JOIN players a2 ON a2.id = ea.player2_id AND a2.club_id = m.club_id
  LEFT JOIN tournament_entries eb ON eb.id = m.entry_b_id AND eb.club_id = m.club_id
  LEFT JOIN players b1 ON b1.id = eb.player1_id AND b1.club_id = m.club_id
  LEFT JOIN players b2 ON b2.id = eb.player2_id AND b2.club_id = m.club_id
  WHERE t.id = p_id AND t.status IN ('zonas', 'llave', 'cerrado') AND m.status <> 'bye'
  ORDER BY m.scheduled_at NULLS LAST, m.stage DESC, z."position" NULLS LAST, m.round, m."position"
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public_tournament_info(text, uuid), public_tournament_board(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_tournament_info(text, uuid), public_tournament_board(text, uuid) TO app_user, platform_user;

-- Responsables de partida + hilo de preguntas para jugadores anonimos.
-- Todo aditivo: no toca tablas ni politicas existentes.

CREATE TABLE IF NOT EXISTS public.match_responsibles (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  contact_discord text,
  contact_phone text,
  contact_email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, admin_user_id)
);

CREATE TABLE IF NOT EXISTS public.match_questions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  text text NOT NULL,
  reply_text text,
  replied_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  replied_at timestamptz,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_questions_match_idx ON public.match_questions (match_id, created_at);
CREATE INDEX IF NOT EXISTS match_responsibles_admin_idx ON public.match_responsibles (admin_user_id);

ALTER TABLE public.match_responsibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_questions ENABLE ROW LEVEL SECURITY;

-- Lectura publica de responsables (los jugadores ven quien gestiona la partida y sus contactos)
CREATE POLICY match_responsibles_read ON public.match_responsibles
  FOR SELECT TO anon, authenticated USING (true);
-- Escritura solo staff autenticado (superadmin/admin eventos/moderador activos)
CREATE POLICY match_responsibles_write ON public.match_responsibles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.status = 'active' AND au.role IN ('superadmin','event_admin','moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.status = 'active' AND au.role IN ('superadmin','event_admin','moderator')));

-- Lectura publica de preguntas no eliminadas
CREATE POLICY match_questions_read ON public.match_questions
  FOR SELECT TO anon, authenticated USING (deleted = false);
-- Los anonimos NO escriben directo: solo via RPC match_question_ask (rate-limit + validaciones).
-- Borrado fisico solo staff via RPC match_question_delete.

-- Util: es el usuario responsable de esta partida (o staff)?
CREATE OR REPLACE FUNCTION public.is_match_responsible(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
      AND au.role IN ('superadmin','event_admin','moderator')
  ) OR EXISTS (
    SELECT 1 FROM public.match_responsibles mr
    WHERE mr.match_id = p_match_id AND mr.admin_user_id = auth.uid()
  );
$$;

-- Preguntar (anonimo): valida partida abierta, longitudes y anti-spam (3 por minuto por partida).
CREATE OR REPLACE FUNCTION public.match_question_ask(
  p_match_id uuid,
  p_name text,
  p_text text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_id bigint;
  v_recent integer;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status <> 'open' THEN
    RAISE EXCEPTION 'esta partida no admite preguntas';
  END IF;

  p_name := left(coalesce(p_name, ''), 40);
  p_text := trim(coalesce(p_text, ''));
  IF char_length(p_text) = 0 OR char_length(p_text) > 500 THEN
    RAISE EXCEPTION 'la pregunta debe tener entre 1 y 500 caracteres';
  END IF;

  SELECT count(*) INTO v_recent FROM public.match_questions
    WHERE match_id = p_match_id AND created_at > now() - interval '1 minute';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'demasiadas preguntas seguidas, espera un minuto';
  END IF;

  INSERT INTO public.match_questions (match_id, author_name, text)
  VALUES (p_match_id, p_name, p_text)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Responder (responsable de la partida o staff autenticado)
CREATE OR REPLACE FUNCTION public.match_question_reply(
  p_question_id bigint,
  p_reply text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.match_questions%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM public.match_questions WHERE id = p_question_id;
  IF NOT FOUND OR v_q.deleted THEN
    RAISE EXCEPTION 'pregunta no encontrada';
  END IF;
  IF NOT public.is_match_responsible(v_q.match_id) THEN
    RAISE EXCEPTION 'no eres responsable de esta partida';
  END IF;
  p_reply := trim(coalesce(p_reply, ''));
  IF char_length(p_reply) = 0 OR char_length(p_reply) > 1000 THEN
    RAISE EXCEPTION 'la respuesta debe tener entre 1 y 1000 caracteres';
  END IF;
  UPDATE public.match_questions
  SET reply_text = p_reply, replied_by = auth.uid(), replied_at = now()
  WHERE id = p_question_id;
END;
$$;

-- Borrar pregunta (responsable o staff): borrado logico
CREATE OR REPLACE FUNCTION public.match_question_delete(p_question_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.match_questions%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM public.match_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pregunta no encontrada';
  END IF;
  IF NOT public.is_match_responsible(v_q.match_id) THEN
    RAISE EXCEPTION 'no eres responsable de esta partida';
  END IF;
  UPDATE public.match_questions SET deleted = true WHERE id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_question_ask(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_question_reply(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_question_delete(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_match_responsible(uuid) TO authenticated;

-- Tiempo real: que las preguntas/respuestas lleguen al instante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'match_questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_questions;
  END IF;
END $$;

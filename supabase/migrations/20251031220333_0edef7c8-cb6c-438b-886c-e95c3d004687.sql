-- Fix function search path security issue
DROP FUNCTION IF EXISTS cleanup_expired_rooms();

CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rooms
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;
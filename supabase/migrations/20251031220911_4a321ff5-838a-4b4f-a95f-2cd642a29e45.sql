-- Add password field to rooms table
ALTER TABLE public.rooms
ADD COLUMN password TEXT;

-- Add policy for password-protected rooms
CREATE POLICY "Anyone can delete their rooms"
  ON public.rooms
  FOR DELETE
  USING (true);
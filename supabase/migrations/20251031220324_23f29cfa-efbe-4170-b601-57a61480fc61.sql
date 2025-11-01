-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  delete_on_view BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  max_views INTEGER DEFAULT NULL
);

-- Create shares table
CREATE TABLE IF NOT EXISTS public.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'file', 'url')),
  content TEXT,
  file_name TEXT,
  file_url TEXT,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth required)
CREATE POLICY "Anyone can view rooms"
  ON public.rooms
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rooms"
  ON public.rooms
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update rooms"
  ON public.rooms
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can view shares"
  ON public.shares
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create shares"
  ON public.shares
  FOR INSERT
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_rooms_expires_at ON public.rooms(expires_at);
CREATE INDEX idx_shares_room_id ON public.shares(room_id);

-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('droply-files', 'droply-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for public access
CREATE POLICY "Anyone can upload files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'droply-files');

CREATE POLICY "Anyone can view files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'droply-files');

-- Create function to cleanup expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.rooms
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;
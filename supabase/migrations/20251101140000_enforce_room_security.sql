-- Secure Room Settings Update Function
-- This function validates creator_token before allowing any room updates

CREATE OR REPLACE FUNCTION public.update_room_settings(
  p_room_id TEXT,
  p_creator_token TEXT,
  p_password TEXT DEFAULT NULL,
  p_permissions TEXT DEFAULT NULL,
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_update_password BOOLEAN DEFAULT FALSE,
  p_update_permissions BOOLEAN DEFAULT FALSE,
  p_update_expires_at BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_creator_token TEXT;
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Get current creator_token for the room
  SELECT creator_token INTO v_current_creator_token
  FROM public.rooms
  WHERE id = p_room_id;

  -- Check if room exists
  IF v_current_creator_token IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Room not found'
    );
  END IF;

  -- Validate creator_token matches
  IF v_current_creator_token != p_creator_token THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Invalid creator token'
    );
  END IF;

  -- Update room settings (only update fields marked for update)
  UPDATE public.rooms
  SET
    password = CASE 
      WHEN p_update_password THEN p_password
      ELSE password
    END,
    permissions = CASE 
      WHEN p_update_permissions THEN p_permissions
      ELSE permissions
    END,
    expires_at = CASE 
      WHEN p_update_expires_at THEN p_expires_at
      ELSE expires_at
    END
  WHERE id = p_room_id
    AND creator_token = p_creator_token;

  GET DIAGNOSTICS v_updated = FOUND;

  IF v_updated THEN
    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to update room settings'
    );
  END IF;
END;
$$;

-- Drop the permissive update policy
DROP POLICY IF EXISTS "Allow room updates" ON public.rooms;

-- Create restricted policy that prevents direct updates
-- Only allow updates through the secure function
CREATE POLICY "Restrict direct room updates"
ON public.rooms
FOR UPDATE
USING (false)  -- Always deny direct updates
WITH CHECK (false);

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.update_room_settings TO anon, authenticated;

-- Add comment explaining the security model
COMMENT ON FUNCTION public.update_room_settings IS 
'Secure function to update room settings. Requires valid creator_token. Direct table updates are blocked by RLS policy.';

-- Drop existing permissive policies for shares
DROP POLICY IF EXISTS "Anyone can create shares in existing rooms" ON public.shares;
DROP POLICY IF EXISTS "Anyone can delete shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can update shares" ON public.shares;

-- Create secure policies for shares that enforce room permissions
-- Only allow INSERT if room permissions are 'edit'
CREATE POLICY "Allow share creation only in edit rooms"
ON public.shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
);

-- Only allow DELETE if room permissions are 'edit'
CREATE POLICY "Allow share deletion only in edit rooms"
ON public.shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE rooms.id = shares.room_id
      AND rooms.permissions = 'edit'
  )
);

-- Prevent updates to shares (content should be immutable once created)
CREATE POLICY "Prevent share updates"
ON public.shares
FOR UPDATE
USING (false)
WITH CHECK (false);


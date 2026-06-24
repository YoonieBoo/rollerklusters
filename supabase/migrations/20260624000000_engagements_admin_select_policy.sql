-- Allow admin/brand/campaign_manager users to read all engagements
-- Creators can already read their own rows via the existing creator policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'engagements'
      AND schemaname = 'public'
      AND policyname = 'Admin users can read all engagements'
  ) THEN
    CREATE POLICY "Admin users can read all engagements"
    ON public.engagements
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('admin', 'brand', 'campaign_manager')
      )
    );
  END IF;
END $$;

-- Allow public read access to gauntlet results (for shareable result pages)
CREATE POLICY "gauntlet_results_public_read" ON gauntlet_results
  FOR SELECT USING (true);


CREATE POLICY "auth read purchase images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-images');
CREATE POLICY "auth write purchase images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-images');
CREATE POLICY "auth update purchase images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'purchase-images') WITH CHECK (bucket_id = 'purchase-images');
CREATE POLICY "auth delete purchase images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'purchase-images');

CREATE POLICY "auth read payment images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-images');
CREATE POLICY "auth write payment images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-images');
CREATE POLICY "auth update payment images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-images') WITH CHECK (bucket_id = 'payment-images');
CREATE POLICY "auth delete payment images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-images');

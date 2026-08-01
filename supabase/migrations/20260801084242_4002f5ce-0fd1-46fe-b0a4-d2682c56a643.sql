DELETE FROM public.purchases WHERE vendor_id = 'ae74451c-1732-48d1-97f5-f792ee0bcc8f' AND is_deleted = true;
DELETE FROM public.payments WHERE vendor_id = 'ae74451c-1732-48d1-97f5-f792ee0bcc8f' AND is_deleted = true;
DELETE FROM public.vendors WHERE id = 'ae74451c-1732-48d1-97f5-f792ee0bcc8f';
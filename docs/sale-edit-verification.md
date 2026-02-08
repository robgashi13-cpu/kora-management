# Sale Edit Integrity Verification Checklist

Use this checklist after any change to sale save/edit flow.

## Preconditions
- User is logged in with a profile that has access to edit sales.
- Browser devtools are open on **Console** and **Network** tabs.

## Required checks (must all pass)
1. Open an existing sale in **Edit Sale**.
2. Change at least 3 fields in one save:
   - Seller
   - Sold Price
   - Notes
3. Click **Update Sale**.
4. Verify immediate UI update:
   - Edit form reflects updated values
   - View Sale modal reflects updated values
   - Sales list row reflects updated values
   - Cars Sold/derived list reflects updated values (if applicable)
5. Verify request correctness in Network tab:
   - Save request is sent
   - Payload contains the edited sale `id`
   - Payload contains updated `seller_name` and `sold_by`
   - Response returns the updated row
6. Verify no errors:
   - No browser console errors/warnings related to save
   - No failed network requests
   - No Supabase sync errors in app logs
7. Hard persistence checks:
   - Refresh browser → updated fields still correct
   - Logout/login → updated fields still correct
8. Cross-surface checks:
   - Reports use updated seller/value fields
   - Exported PDF/contract/invoice (if generated from sale) shows updated seller/value fields

If any step fails, treat as a release blocker.

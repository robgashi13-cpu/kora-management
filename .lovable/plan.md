## PDF Generation Log Tab

Add a new "PDF Logs" tab in the main navigation, visible only to **Robert (Admin)** and **SHYQA**. Every PDF generated anywhere in the app is recorded with who generated it, when, and what — and clicking an entry re-opens the exact PDF that was produced.

### 1. Database (Lovable Cloud)
Reuse existing `audit_logs` table (already populated by `logAuditEvent`). Add a new Storage bucket:
- Bucket: `pdf-logs` (private)
- Purpose: store every generated PDF blob
- Path scheme: `{yyyy-mm}/{timestamp}-{filename}.pdf`

### 2. PDF engine hook (minimal additive)
`components/pdfUtils.ts` — add one block at the very end of `generatePdf`, right before returning the result, that fires:
```ts
window.dispatchEvent(new CustomEvent('pdf-generated', {
  detail: { blob, filename, elementId, source: <single inferred string> }
}));
```
No rendering or engine code is touched.

### 3. Global listener (Dashboard)
In `Dashboard.tsx` add a `useEffect` that listens for `pdf-generated`. On each event:
- Upload blob to `pdf-logs` bucket
- Call existing `logAuditEvent({ actionType: 'PREVIEW', entityType: 'pdf', entityId: filename, metadata: { storage_path, sale_id?, doc_type, file_size, generated_at } })`

### 4. Nav tab
Add to `navItems`:
```
{ id: 'PDF_LOGS', label: 'PDF Logs', icon: ScrollText, view: 'pdf_logs', allowedProfiles: ['Robert', 'SHYQA'] }
```
Gate via existing `allowedProfiles` mechanism.

### 5. PDF Logs view
New `view === 'pdf_logs'` block reusing the same audit data fetch logic, filtered to `entity_type='pdf'`. Each row shows:
- Date/time
- Profile (e.g. "Robert" / "SHYQA")
- Document type & filename
- Linked sale (brand · model · VIN) if `sale_id` present
- **Open** button → fetches a signed URL from `pdf-logs` storage and opens in a new tab

Pagination identical to existing Records view (200/page).

### 6. Access control
- `allowedProfiles: ['Robert', 'SHYQA']` gates the nav tab
- The view body double-checks `userProfile` is one of those two and shows an Access Denied panel otherwise
- Storage bucket is private; signed URLs generated on demand (~1h expiry)

### Files touched
- `components/pdfUtils.ts` — 1 additive block (event dispatch only)
- `components/Dashboard.tsx` — nav entry, listener effect, fetch + render of new view
- Supabase migration — create `pdf-logs` storage bucket + storage policies

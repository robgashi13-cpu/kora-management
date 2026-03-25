
Goal: Fix invoice download so it is always a single page (no blank page 2) and visually matches the preview (including stamp placement), without changing non-invoice behavior.

1) Scope lock (invoice-only)
- Limit changes to invoice PDF rendering flow only.
- Do not change invoice data fields, business logic, references, or other document types (Kontratë/Marveshje/etc).

2) Add an invoice “exact preview” rendering path in `components/pdfUtils.ts`
- Extend `PdfGenerationOptions` with an invoice-only mode (e.g. `exactPreview: true` or `documentType: 'invoice'`).
- For this mode, render invoice as a single canvas capture (html2canvas) and place it into a single-page PDF whose page size matches the captured content.
- Use exact measured content dimensions instead of fixed A4 minimum/rounding logic for invoice mode.
- Keep existing html2pdf multi-page flow unchanged for non-invoice documents.

3) Remove root cause of blank second page for invoice mode
- Avoid forced A4 fallback height and integer rounding for invoice mode.
- In invoice clone processing, explicitly neutralize height constraints that create overflow (`min-height`, `max-height`, forced wrappers) on invoice root.
- Ensure capture height is based on real invoice content box so trailing blank page cannot be generated.

4) Preserve stamp/layout parity with preview
- In invoice clone pass, keep invoice visual styles exactly as rendered (no invoice-specific reflow changes).
- Ensure stamp image is fully decoded before capture and that invoice signature/stamp block is captured in-place.
- Keep download path rasterized from preview layout for pixel-faithful positioning.

5) Wire invoice mode in all invoice creation paths
- Update invoice PDF callers to pass invoice exact mode:
  - `components/EditablePreviewModal.tsx`
  - `components/InvoiceModal.tsx`
  - `components/ViewSaleModal.tsx`
- Set `editableText: false` for invoice exports where needed so the output remains visual-only and stable.

6) Verification checklist (before closing)
- Test download from each invoice entry flow above.
- Validate:
  - exactly 1 page in PDF
  - no trailing blank page
  - stamp position matches preview
  - header/table/footer alignment matches preview
- Regression check: contract/marreveshje/deposit downloads still behave as before.

Technical details
- Primary issue is current invoice generation mixing fixed A4 fallback + rounded px math + content constraints, which can produce tiny overflow and trigger a second empty page.
- Proposed fix uses invoice-specific page sizing from actual rendered content (preview-faithful capture), while leaving existing multi-page A4 logic untouched for other documents.
- This is the safest minimal-impact approach for your “do not touch anything else” requirement.

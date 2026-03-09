

## Add download button for uploaded policy document

Currently, when a teacher uploads a policy document, the UI shows the document exists with a remove button, but there's no way to download/view it.

### Change

In `src/components/Settings/CancellationPolicySettings.tsx` (lines 419-439), add a "Download" button next to the existing "Remove" button in the section that shows when `policyDocumentUrl` is truthy.

The download will use `supabase.storage.from('policies').getPublicUrl(policyDocumentUrl)` to get the URL and open it in a new tab.

### i18n

Add a `download` key under `cancellationPolicy.document` in both `pt/settings.json` and `en/settings.json` (e.g., "Baixar PDF" / "Download PDF").


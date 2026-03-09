

## Remove button text, keep only icons

In `src/components/Settings/CancellationPolicySettings.tsx` (lines 431-450):

- Remove the text `{t('cancellationPolicy.document.download')}` from the Download button
- Remove the text `{t('cancellationPolicy.document.remove')}` from the Remove button
- Remove `mr-2` from both icon classNames since there's no text to space from
- Change `size="sm"` to `size="icon"` on both buttons for proper square icon button sizing


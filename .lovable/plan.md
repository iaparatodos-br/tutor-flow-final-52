

# Fix: Add scroll to Material Upload and Category modals

Both `DialogContent` components lack `max-height` and `overflow-y` constraints, causing content to overflow on smaller screens.

## Changes

### 1. `src/components/MaterialUploadModal.tsx` (line 285)
Add `max-h-[85vh] overflow-y-auto` to `DialogContent`:
```tsx
<DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
```

### 2. `src/components/CategoryModal.tsx` (line 116)
Same fix:
```tsx
<DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
```

Two single-line changes. No logic changes needed.


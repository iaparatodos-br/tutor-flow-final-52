

# Fix: Sidebar Navigation Not Scrollable on Small Screens

## Problem
The navigation section (line 163) uses `flex-1` but lacks `overflow-y-auto`, so when the menu items exceed the viewport height, they're clipped with no way to scroll.

## Change — `src/components/AppSidebar.tsx`

**Line 163** — Add `overflow-y-auto` to the navigation container:

```tsx
// Before
<div className={`flex-1 ${!isOpen ? 'px-2' : 'px-4'} py-4`}>

// After
<div className={`flex-1 overflow-y-auto ${!isOpen ? 'px-2' : 'px-4'} py-4`}>
```

Single-line change. The header and footer sections remain fixed; only the nav area scrolls.


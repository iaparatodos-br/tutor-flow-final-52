

## Plan: Add orange info banner below subtitle in ClassServicesManager

The subtitle text "Gerencie os diferentes tipos de aula e seus valores" is rendered in `src/components/ClassServicesManager.tsx` at line 97-99.

### Changes

**`src/components/ClassServicesManager.tsx`** (line ~100): After the closing `</div>` of the title/subtitle block (line 100), add the orange info div:

```tsx
</div>
<div className="bg-orange-50/50 border-l-4 border-orange-500 p-4 my-6 rounded-r-lg text-orange-900 text-sm leading-relaxed">
  {t('infoBanner')}
</div>
```

**`src/pages/Servicos.tsx`**: Remove the existing orange banner (lines 22-26) since it will now live inside `ClassServicesManager` directly below the subtitle, avoiding duplication.

This ensures the banner inherits the same container width as the title/subtitle above it and uses the already-defined `infoBanner` i18n key.


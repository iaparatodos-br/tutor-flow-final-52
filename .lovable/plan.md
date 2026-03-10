

## Plan: Add informative block below subtitle in ClassServicesManager

**File**: `src/components/ClassServicesManager.tsx`

**Change**: After line 100 (closing `</div>` of the title/subtitle block), add the informative block:

```tsx
<div className="border-l-2 border-primary/30 pl-4 py-1 my-6 max-w-3xl">
  <p className="text-sm text-muted-foreground leading-relaxed">
    Serviços são os tipos de aulas ou atendimentos que você oferece. Aqui você define o nome <span className="italic text-primary/70">(ex: Aula Particular de Inglês)</span>, a duração padrão e o valor. Ao criar seus serviços, você agiliza a criação da agenda para facilitar o seu cotidiano.
  </p>
</div>
```

Single insertion, no other files affected.


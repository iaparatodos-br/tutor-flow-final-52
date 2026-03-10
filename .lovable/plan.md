

## Plan: Add description text below page title

**File**: `src/pages/Servicos.tsx`

**Change**: Add a heading and a muted description paragraph above the Tabs component, with `mb-6` spacing.

```tsx
<div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
  <div className="mb-6">
    <h1 className="text-2xl font-bold">Serviços</h1>
    <p className="text-muted-foreground mt-2">
      Serviços são os tipos de aulas ou atendimentos que você oferece. Aqui você define o nome (ex: Aula Particular de Inglês), a duração padrão e o valor. Ao criar seus serviços, você agiliza a criação da agenda para facilitar o seu cotidiano.
    </p>
  </div>
  <Tabs defaultValue="services">
    ...
  </Tabs>
</div>
```

Single file change, straightforward addition.


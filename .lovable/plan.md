

# Auditoria v2.9: 3 Componentes Frontend Faltantes

## Resumo

Cruzamento do plano v2.9 com toda a base de codigo. Encontrei **3 arquivos frontend faltantes** com bugs reais de timezone.

---

## Gap 1: `src/components/StudentSubscriptionSelect.tsx` -- 3x data do dia atual sem timezone

**Linhas 53, 59, 64**:

```typescript
const [startsAt, setStartsAt] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
// ...
setStartsAt(format(new Date(), 'yyyy-MM-dd'));
// ...
setStartsAt(format(new Date(), 'yyyy-MM-dd'));
```

**Problema**: `format(new Date(), 'yyyy-MM-dd')` do date-fns usa a hora LOCAL do browser para gerar a data. Embora `format()` do date-fns use hora local (nao UTC), a data resultante e no fuso do browser, nao no fuso do perfil do utilizador. Para um professor que esta temporariamente num fuso diferente do seu perfil (ex: viajou de BRT para UTC+9), o `startsAt` refletira o dia no fuso do browser, nao no fuso configurado.

**Criticidade**: Baixa (date-fns `format` ja usa hora local, o que e correto na maioria dos casos, mas nao respeita o timezone do perfil).

**Acao**: Adicionar a tabela do Passo 8 para migracao para utilitario timezone-aware que usa o timezone do perfil.

---

## Gap 2: `src/components/ClassExceptionForm.tsx` -- Data e hora extraidas com metodos inconsistentes

**Linhas 65-67**:

```typescript
const startDate = new Date(originalClass.start);
const dateStr = startDate.toISOString().split('T')[0];  // UTC date
const timeStr = startDate.toTimeString().slice(0, 5);    // LOCAL time
```

**Problema**: A data e extraida em UTC (`toISOString`) mas o horario e extraido em hora local (`toTimeString`). Isso causa inconsistencia: para uma aula as 22:00 BRT do dia 15, o formulario pre-preenche com data **16** (UTC) mas horario **22:00** (local). O professor ve o dia errado no formulario de excecao.

**Criticidade**: Media -- afeta a usabilidade do formulario de excecao de aula (pre-preenche data errada).

**Acao**: Adicionar a tabela do Passo 8. Migrar ambas as extracoes para usar o timezone do perfil do utilizador.

---

## Gap 3: `src/components/FutureClassExceptionForm.tsx` -- Mesmo bug do ClassExceptionForm

**Linhas 67-69**: Codigo identico ao Gap 2.

```typescript
const startDate = new Date(originalClass.start);
const dateStr = startDate.toISOString().split('T')[0];  // UTC date
const timeStr = startDate.toTimeString().slice(0, 5);    // LOCAL time
```

**Criticidade**: Media -- mesmo impacto.

**Acao**: Adicionar a tabela do Passo 8.

---

## Verificacoes Realizadas (Sem Novos Gaps)

- Todas as 17 edge functions: cobertas pelo plano
- Todas as 7 RPCs: cobertas pelo plano
- `MobileCalendarList.tsx`: ja listado no plano
- `SecurityMonitoringDashboard.tsx`: corretamente excluido (pagina debug)
- `DevValidation.tsx`: corretamente excluido

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 -- Adicionar 3 linhas

| Arquivo | Problema |
|---|---|
| `src/components/StudentSubscriptionSelect.tsx` | 3x `format(new Date(), 'yyyy-MM-dd')` para default de `startsAt` -- usa timezone do browser em vez do perfil |
| `src/components/ClassExceptionForm.tsx` | `toISOString().split('T')[0]` (UTC) + `toTimeString()` (local) -- inconsistencia data/hora, pre-preenche dia errado |
| `src/components/FutureClassExceptionForm.tsx` | Mesmo bug: `toISOString().split('T')[0]` (UTC) + `toTimeString()` (local) |

### 2. Secao 3 (Arquivos Impactados) -- Adicionar 3 linhas

| Arquivo | Tipo de Mudanca |
|---|---|
| `src/components/StudentSubscriptionSelect.tsx` | Migrar 3x `format(new Date())` para utilitario timezone-aware |
| `src/components/ClassExceptionForm.tsx` | Migrar extracao de data/hora para utilitario timezone-aware |
| `src/components/FutureClassExceptionForm.tsx` | Migrar extracao de data/hora para utilitario timezone-aware |

### 3. Checklist item 7 -- Atualizar contagem

De **31 componentes** para **34 componentes** (31 + 3 novos).

### 4. Versao do documento

Atualizar para **v3.0** (v2.9 + StudentSubscriptionSelect + ClassExceptionForm + FutureClassExceptionForm).


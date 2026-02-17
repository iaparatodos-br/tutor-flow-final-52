
# Etapa 0.1 — Corrigir Status Mismatch pt-BR ✅
# Etapa 0.2 — Guard Clauses / Race Conditions ✅
# Etapa 0.3 — Webhook Resilience / HTTP 500 ✅
# Etapa 0.4 — Audit Logs Schema Mismatch ✅
# Etapa 0.5 — .single() → .maybeSingle() ✅
# Etapa 0.6 — FK Joins proibidos no Deno ✅
# Etapa 0.7 — Categoria A: Auth/IDOR ✅

## Etapa 0.7 — Resumo

Adicionada autenticação JWT e validação de propriedade em 17 Edge Functions para corrigir ~25 vulnerabilidades Auth/IDOR.

### Funções Financeiras Críticas (6 funções)

1. **create-payment-intent-connect** — JWT auth + validação de propriedade (student/teacher/responsible)
2. **verify-payment-status** — JWT auth + verificação student_id/teacher_id
3. **change-payment-method** — Corrigido bug de `.eq()` sobrepostos no guardian check; adicionada permissão para teacher
4. **handle-teacher-subscription-cancellation** — JWT auth + validação teacher_id === auth.uid()
5. **smart-delete-student** — JWT auth + validação teacher_id === auth.uid() + persistSession:false
6. **process-cancellation** — JWT auth + anti-spoofing (safeCancelledBy = auth.uid()) + persistSession:false

### Funções Admin/Diagnóstico (3 funções)

7. **stripe-events-monitor** — JWT auth + verificação role === 'professor'
8. **validate-business-profile-deletion** — JWT auth + validação ownership do business_profile
9. **refresh-stripe-connect-account** — Corrigido IDOR: adicionado `.eq('teacher_id', user.id)` no UPDATE de payment_accounts

### Funções de Notificação (8 funções)

10. **send-student-invitation** — Auth (JWT ou service role)
11. **send-class-report-notification** — Auth (JWT ou service role)
12. **send-material-shared-notification** — Auth (JWT ou service role) + persistSession:false
13. **send-cancellation-notification** — Auth (JWT ou service role) + persistSession:false
14. **send-class-request-notification** — Auth (JWT ou service role)
15. **send-class-confirmation-notification** — Auth (JWT ou service role)
16. **send-invoice-notification** — Auth (JWT ou service role)
17. **send-boleto-subscription-notification** — Auth (JWT ou service role)

### Padrão Aplicado

- Funções chamadas pelo frontend: JWT obrigatório + validação de propriedade do recurso
- Funções chamadas server-to-server: aceita JWT OU service role key
- Identity spoofing prevenido: campos como `cancelled_by` e `teacher_id` do body são substituídos por `auth.uid()`

## Próximas Etapas Pendentes (Fase 0)

- **Categoria H**: FK Cascade / Deletion failures (~8 itens)
- **Categoria I**: Data Corruption (~6 itens)
- **Categoria J**: Integridade de dados (~8 itens)
- **Categoria K**: ANON_KEY inline / SQL injection em setup (~6 itens)
- **Categoria L**: Outros itens Fase 0 (~20 itens)

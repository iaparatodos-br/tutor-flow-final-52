

# Criar documento de plano de implementação de Timezones

Vou criar o arquivo `docs/timezone-multi-support-implementation-plan.md` com o plano completo de implementação de suporte a múltiplos fusos horários, seguindo o mesmo padrão dos outros documentos em `docs/`.

## Arquivo a criar

**`docs/timezone-multi-support-implementation-plan.md`**

Conteúdo baseado no plano aprovado anteriormente, cobrindo:
- Contexto e motivação (migração de timezone fixo para multi-timezone)
- Os 7 passos de implementação (migração DB, detecção frontend, hook de sync, cron horário, hourly sweeper, idempotência, dependência date-fns-tz)
- Tabela de arquivos impactados
- Riscos e mitigações
- Plano de testes

Nenhuma alteração de código — apenas criação do documento de referência.


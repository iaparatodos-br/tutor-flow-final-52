import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Política de Privacidade - TutorFlow</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-6 text-sm">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Introdução</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Esta Política de Privacidade descreve como o TutorFlow coleta, usa, armazena e protege suas informações
                    pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Dados Coletados</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium mb-2">2.1 Dados Fornecidos por Você</h3>
                      <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                        <li>Nome completo, email e telefone</li>
                        <li>CPF e endereço (para fins de faturamento)</li>
                        <li>Informações de pagamento (processadas pelo Stripe)</li>
                        <li>Materiais didáticos e conteúdo de aulas</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">2.2 Dados Coletados Automaticamente</h3>
                      <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                        <li>Endereço IP e dados de navegação</li>
                        <li>Informações de dispositivo e navegador</li>
                        <li>Cookies e tecnologias similares</li>
                        <li>Histórico de uso da plataforma</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. Uso dos Dados</h2>
                  <p className="text-muted-foreground mb-2">Utilizamos seus dados para:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                    <li>Fornecer e melhorar nossos serviços</li>
                    <li>Processar pagamentos e emitir faturas</li>
                    <li>Enviar notificações sobre aulas e atualizações</li>
                    <li>Garantir segurança e prevenir fraudes</li>
                    <li>Cumprir obrigações legais</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. Compartilhamento de Dados</h2>
                  <p className="text-muted-foreground mb-2">Compartilhamos dados apenas quando necessário:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                    <li><strong>Stripe:</strong> Para processamento de pagamentos</li>
                    <li><strong>Supabase:</strong> Para hospedagem e armazenamento de dados</li>
                    <li><strong>Autoridades:</strong> Quando exigido por lei</li>
                  </ul>
                  <p className="text-muted-foreground mt-2">
                    Nunca vendemos seus dados para terceiros.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Seus Direitos (LGPD)</h2>
                  <p className="text-muted-foreground mb-2">Você tem direito a:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                    <li>Confirmar a existência de tratamento de dados</li>
                    <li>Acessar seus dados pessoais</li>
                    <li>Corrigir dados incompletos ou desatualizados</li>
                    <li>Solicitar anonimização ou exclusão de dados</li>
                    <li>Revogar consentimento a qualquer momento</li>
                    <li>Obter portabilidade dos dados</li>
                  </ul>
                  <p className="text-muted-foreground mt-3">
                    Para exercer seus direitos, acesse a seção "Privacidade" em suas configurações ou entre em contato
                    através de privacidade@tutorflow.com
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Retenção e Exclusão</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Mantemos seus dados enquanto sua conta estiver ativa. Após o cancelamento, você terá 90 dias para
                    exportar suas informações. Após esse período, seus dados serão permanentemente excluídos, exceto
                    quando a retenção for exigida por lei (ex: registros fiscais).
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Segurança</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                    <li>Criptografia de dados em trânsito (SSL/TLS)</li>
                    <li>Controle de acesso baseado em permissões</li>
                    <li>Backups regulares</li>
                    <li>Monitoramento de segurança 24/7</li>
                  </ul>
                  <p className="text-muted-foreground mt-2">
                    Em caso de incidente de segurança, você será notificado conforme exigido pela LGPD.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Cookies</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Utilizamos cookies essenciais para funcionamento da plataforma e cookies analíticos para melhorar
                    a experiência do usuário. Você pode gerenciar suas preferências de cookies nas configurações do navegador.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Tutores como Controladores</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    <strong>Importante:</strong> Os tutores são considerados controladores dos dados de seus alunos
                    conforme Art. 42 da LGPD. Eles são responsáveis por garantir que possuem base legal adequada para
                    tratar os dados pessoais e devem obter consentimento dos alunos ou responsáveis quando necessário.
                    O TutorFlow atua como operador neste contexto.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Menores de Idade</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Para alunos menores de 18 anos, exigimos que os tutores obtenham consentimento dos responsáveis
                    legais. O tratamento de dados de menores deve seguir as regras específicas da LGPD.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. Alterações na Política</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Podemos atualizar esta política periodicamente. Mudanças significativas serão comunicadas por email
                    e você poderá ser solicitado a aceitar a nova versão.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">12. Contato e Encarregado de Dados (DPO)</h2>
                  <div className="text-muted-foreground space-y-2">
                    <p>Para questões sobre privacidade, entre em contato:</p>
                    <p><strong>Email:</strong> privacidade@tutorflow.com</p>
                    <p><strong>Email Geral:</strong> contato@tutorflow.com</p>
                  </div>
                </section>

                <p className="text-xs text-muted-foreground mt-8 pt-4 border-t">
                  Última atualização: 25 de outubro de 2025 | Versão: v1.0-2025-10-25
                </p>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

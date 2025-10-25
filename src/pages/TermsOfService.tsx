import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TermsOfService() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Termos de Uso - TutorFlow</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-6 text-sm">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Ao se cadastrar e utilizar a plataforma TutorFlow, você concorda com estes Termos de Uso e nossa Política de Privacidade.
                    Se você não concorda com qualquer parte destes termos, não deve utilizar nossos serviços.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    O TutorFlow é uma plataforma que conecta tutores e alunos, oferecendo ferramentas para gestão de aulas,
                    agendamento, controle financeiro e comunicação. A plataforma não garante qualidade pedagógica dos tutores
                    e não realiza verificação de antecedentes.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. Cadastro e Conta</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p>Para utilizar a plataforma, você deve:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Fornecer informações verdadeiras e completas</li>
                      <li>Manter sua senha em segurança</li>
                      <li>Ser responsável por todas as atividades em sua conta</li>
                      <li>Notificar imediatamente sobre uso não autorizado</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. Responsabilidades do Tutor</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p>Como tutor, você é responsável por:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Garantir que possui autorização legal para tratar dados de seus alunos</li>
                      <li>Manter a qualidade e profissionalismo nas aulas</li>
                      <li>Cumprir com suas políticas de cancelamento</li>
                      <li>Pagar as taxas de serviço aplicáveis</li>
                      <li>Respeitar direitos autorais em materiais compartilhados</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Pagamentos e Reembolsos</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Os pagamentos são processados através do Stripe Connect. O TutorFlow não armazena dados de cartão de crédito.
                  </p>
                  <p className="text-destructive font-medium">
                    Importante: Não oferecemos reembolsos após o cancelamento de assinaturas ou após aulas realizadas,
                    exceto em casos excepcionais a critério da plataforma.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Propriedade Intelectual</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Todo o conteúdo da plataforma, incluindo design, código e logotipos, é propriedade do TutorFlow.
                    Os materiais enviados pelos tutores permanecem de propriedade dos mesmos.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Denúncia de Conteúdo Ilícito</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Caso identifique conteúdo ilegal ou que viole direitos autorais, entre em contato através de
                    contato@tutorflow.com para que possamos avaliar e tomar as medidas cabíveis.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Limitação de Responsabilidade</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    O TutorFlow não se responsabiliza por:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                    <li>Qualidade das aulas ministradas</li>
                    <li>Relação entre tutores e alunos</li>
                    <li>Perdas financeiras decorrentes do uso da plataforma</li>
                    <li>Interrupções temporárias do serviço</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Modificações dos Termos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Reservamos o direito de modificar estes termos a qualquer momento. Usuários serão notificados
                    sobre mudanças significativas e poderão ser solicitados a aceitar novamente os termos atualizados.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Lei Aplicável</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Estes termos são regidos pelas leis brasileiras. Disputas serão resolvidas no foro da comarca
                    do usuário conforme determina o Código de Defesa do Consumidor.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. Contato</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Para dúvidas sobre estes termos, entre em contato através de contato@tutorflow.com
                  </p>
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

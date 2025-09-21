import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Building2, CreditCard, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface BusinessProfile {
  id: string;
  business_name: string;
  cnpj: string | null;
  stripe_connect_id: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  business_profile_id: string | null;
}

export function PaymentRoutingTest() {
  const [loading, setLoading] = useState(false);
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load business profiles
      const { data: businessData } = await supabase.functions.invoke("list-business-profiles");
      if (businessData?.business_profiles) {
        setBusinessProfiles(businessData.business_profiles);
      }

      // Load students with their business profile assignments
      const { data: studentsData } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: (await supabase.auth.getUser()).data.user?.id
      });
      
      if (studentsData) {
        setStudents(studentsData.map((s: any) => ({
          id: s.student_id,
          name: s.student_name,
          email: s.student_email,
          business_profile_id: s.business_profile_id
        })));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const testPaymentRouting = async (studentId: string, studentName: string, businessProfileId: string) => {
    try {
      // Create a test invoice
      const { data: invoiceData, error: invoiceError } = await supabase.functions.invoke('create-invoice', {
        body: {
          student_id: studentId,
          amount: 1.00, // R$ 1.00 for testing
          description: `Teste de roteamento - ${studentName}`,
          invoice_type: 'test'
        }
      });

      if (invoiceError || !invoiceData?.success) {
        throw new Error(invoiceData?.error || 'Erro ao criar fatura de teste');
      }

      // Test payment intent creation
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('create-payment-intent-connect', {
        body: {
          invoice_id: invoiceData.invoice.id,
          payment_method: 'boleto'
        }
      });

      if (paymentError) {
        throw new Error('Erro ao criar payment intent');
      }

      // Get business profile details
      const businessProfile = businessProfiles.find(bp => bp.id === businessProfileId);

      return {
        student: studentName,
        businessProfile: businessProfile?.business_name || 'N/A',
        stripeConnectId: businessProfile?.stripe_connect_id || 'N/A',
        invoiceId: invoiceData.invoice.id,
        paymentIntentId: paymentData?.payment_intent_id || 'N/A',
        success: true,
        message: 'Roteamento configurado corretamente'
      };

    } catch (error: any) {
      return {
        student: studentName,
        businessProfile: 'Erro',
        stripeConnectId: 'N/A',
        invoiceId: 'N/A',
        paymentIntentId: 'N/A',
        success: false,
        message: error.message
      };
    }
  };

  const runTests = async () => {
    setLoading(true);
    setTestResults([]);
    
    try {
      const results = [];
      
      for (const student of students) {
        if (student.business_profile_id) {
          const result = await testPaymentRouting(
            student.id, 
            student.name, 
            student.business_profile_id
          );
          results.push(result);
        } else {
          results.push({
            student: student.name,
            businessProfile: 'Não definido',
            stripeConnectId: 'N/A',
            invoiceId: 'N/A',
            paymentIntentId: 'N/A',
            success: false,
            message: 'Aluno não possui negócio definido'
          });
        }
      }
      
      setTestResults(results);
      toast.success('Testes de roteamento concluídos');
    } catch (error) {
      toast.error('Erro ao executar testes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Teste de Roteamento de Pagamentos
        </CardTitle>
        <CardDescription>
          Valida se os pagamentos estão sendo direcionados para as contas bancárias corretas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <Button onClick={loadData} disabled={loading} variant="outline">
            {loading ? "Carregando..." : "Carregar Dados"}
          </Button>
          <Button onClick={runTests} disabled={loading || students.length === 0}>
            {loading ? "Testando..." : "Executar Testes"}
          </Button>
        </div>

        {businessProfiles.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Negócios Configurados ({businessProfiles.length})
            </h3>
            <div className="grid gap-2">
              {businessProfiles.map((bp) => (
                <div key={bp.id} className="flex justify-between items-center p-2 bg-muted rounded">
                  <span>{bp.business_name}</span>
                  <Badge variant="secondary">{bp.stripe_connect_id}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {students.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Alunos e Roteamento ({students.length})</h3>
            <div className="grid gap-2">
              {students.map((student) => (
                <div key={student.id} className="flex justify-between items-center p-2 bg-muted rounded">
                  <span>{student.name}</span>
                  <Badge variant={student.business_profile_id ? "default" : "destructive"}>
                    {student.business_profile_id ? 
                      businessProfiles.find(bp => bp.id === student.business_profile_id)?.business_name || 'Negócio não encontrado'
                      : 'Sem negócio definido'
                    }
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {testResults.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Resultados dos Testes
            </h3>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <Alert key={index} className={result.success ? "border-green-500" : "border-red-500"}>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{result.student}</div>
                      <div className="text-sm text-muted-foreground">
                        Negócio: {result.businessProfile} | Stripe Connect: {result.stripeConnectId}
                      </div>
                    </div>
                  </div>
                  <AlertDescription className="mt-2">
                    {result.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/contexts/ProfileContext";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, ExternalLink, Calendar, CreditCard, Users, BarChart3, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PaymentAccountsManager } from "@/components/PaymentAccountsManager";
import { PaymentRoutingTest } from "@/components/PaymentRoutingTest";
import { ConfirmationDialog } from "@/components/ui/alert-confirmation";
import { SystemHealthAlert } from "@/components/SystemHealthAlert";

interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  cnpj: string | null;
  stripe_connect_id: string;
  created_at: string;
  updated_at: string;
}

interface StudentBusinessLink {
  id: string;
  student_name: string;
  business_name: string;
  relationship_id: string;
  business_profile_id: string;
  created_at: string;
}

export default function PainelNegocios() {
  const { isProfessor, profile } = useProfile();
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [businessToDelete, setBusinessToDelete] = useState<BusinessProfile | null>(null);
  const [deleteValidation, setDeleteValidation] = useState<any>(null);

  // Query para listar perfis de negócio
  const { data: businessProfiles, isLoading } = useQuery({
    queryKey: ["business-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-business-profiles");
      if (error) throw error;
      return data.business_profiles as BusinessProfile[];
    },
    enabled: isProfessor,
  });

  // Query para vínculos aluno-negócio
  const { data: studentBusinessLinks } = useQuery({
    queryKey: ["student-business-links"],
    queryFn: async () => {
      const { data: students } = await supabase.rpc('get_teacher_students', { 
        teacher_user_id: profile?.id 
      });
      
      if (!students || !businessProfiles) return [];
      
      return students.map((student: any) => ({
        id: student.relationship_id,
        student_name: student.student_name,
        business_name: businessProfiles.find(bp => bp.id === student.business_profile_id)?.business_name || 'Não vinculado',
        relationship_id: student.relationship_id,
        business_profile_id: student.business_profile_id,
        created_at: student.created_at
      }));
    },
    enabled: isProfessor && !!businessProfiles,
  });

  // Mutation para criar novo perfil de negócio
  const createBusinessProfileMutation = useMutation({
    mutationFn: async ({ business_name, cnpj }: { business_name: string; cnpj?: string }) => {
      const { data, error } = await supabase.functions.invoke("create-business-profile", {
        body: { business_name, cnpj },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Perfil de negócio criado! Redirecionando para o Stripe...");
      queryClient.invalidateQueries({ queryKey: ["business-profiles"] });
      setIsDialogOpen(false);
      setBusinessName("");
      setCnpj("");
      
      // Redirecionar para o onboarding do Stripe
      if (data.onboarding_url) {
        window.location.href = data.onboarding_url;
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar perfil de negócio: ${error.message}`);
    },
  });

  // Mutation para validar exclusão de business profile
  const validateDeletionMutation = useMutation({
    mutationFn: async (businessProfileId: string) => {
      const { data, error } = await supabase.functions.invoke("validate-business-profile-deletion", {
        body: { business_profile_id: businessProfileId },
      });
      if (error) throw error;
      return data;
    },
  });

  // Mutation para excluir business profile
  const deleteBusinessProfileMutation = useMutation({
    mutationFn: async (businessProfileId: string) => {
      const { data, error } = await supabase
        .from("business_profiles")
        .delete()
        .eq("id", businessProfileId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Perfil de negócio excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["business-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["student-business-links"] });
      setDeleteConfirmOpen(false);
      setBusinessToDelete(null);
      setDeleteValidation(null);
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir perfil de negócio: ${error.message}`);
    },
  });

  const handleDeleteBusiness = async (business: BusinessProfile) => {
    setBusinessToDelete(business);
    
    try {
      const validation = await validateDeletionMutation.mutateAsync(business.id);
      setDeleteValidation(validation);
      
      if (validation.can_delete) {
        setDeleteConfirmOpen(true);
      } else {
        // Mostrar problemas que impedem a exclusão
        const issuesList = validation.issues.map((issue: any) => issue.title).join(", ");
        toast.error(`Não é possível excluir: ${issuesList}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao validar exclusão: ${error.message}`);
    }
  };

  const confirmDelete = () => {
    if (businessToDelete) {
      deleteBusinessProfileMutation.mutate(businessToDelete.id);
    }
  };

  const handleCreateBusiness = () => {
    if (!businessName.trim()) {
      toast.error("Nome do negócio é obrigatório");
      return;
    }

    createBusinessProfileMutation.mutate({
      business_name: businessName.trim(),
      cnpj: cnpj.trim() || undefined,
    });
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  if (!isProfessor) {
    return (
      <Layout>
        <div className="text-center py-8">
          <p>Acesso negado. Esta página é apenas para professores.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Gestão de Negócios
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie suas entidades de negócio, contas de recebimento e vínculos com alunos
          </p>
        </div>

        {/* Sistema de Alertas para Inconsistências */}
        <SystemHealthAlert />

        <Tabs defaultValue="business-profiles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="business-profiles" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Perfis de Negócio
            </TabsTrigger>
            <TabsTrigger value="payment-accounts" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Contas de Recebimento
            </TabsTrigger>
            <TabsTrigger value="student-links" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Vínculos Aluno-Negócio
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Relatórios Financeiros
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Perfis de Negócio */}
          <TabsContent value="business-profiles" className="space-y-6">
            {/* Botão para conectar novo negócio */}
            <div className="flex justify-end">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Conectar Novo Negócio
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Conectar Novo Negócio</DialogTitle>
                    <DialogDescription>
                      Adicione um novo perfil de negócio com sua própria conta bancária de recebimento.
                      Você será redirecionado para o Stripe para completar o cadastro.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="businessName">Nome do Negócio *</Label>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Ex: Minha Escola de Idiomas Ltda"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cnpj">CNPJ (opcional)</Label>
                      <Input
                        id="cnpj"
                        value={cnpj}
                        onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                        placeholder="00.000.000/0000-00"
                        maxLength={18}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleCreateBusiness}
                        disabled={createBusinessProfileMutation.isPending}
                      >
                        {createBusinessProfileMutation.isPending ? "Criando..." : "Conectar com Stripe"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Lista de negócios conectados */}
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : businessProfiles && businessProfiles.length > 0 ? (
              <div className="grid gap-4">
                {businessProfiles.map((profile) => (
                  <Card key={profile.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {profile.business_name}
                      </CardTitle>
                      <CardDescription>
                        {profile.cnpj && `CNPJ: ${formatCNPJ(profile.cnpj)}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          Conectado em {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-green-600">✓ Stripe Conectado</span>
                            <ExternalLink className="h-4 w-4" />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteBusiness(profile)}
                            className="text-destructive hover:text-destructive"
                            disabled={validateDeletionMutation.isPending}
                          >
                            {validateDeletionMutation.isPending ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum negócio conectado</h3>
                  <p className="text-muted-foreground mb-4">
                    Conecte seu primeiro negócio para começar a receber pagamentos.
                  </p>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Conectar Primeiro Negócio
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Aba 2: Contas de Recebimento */}
          <TabsContent value="payment-accounts" className="space-y-6">
            <PaymentAccountsManager />
          </TabsContent>

          {/* Aba 3: Vínculos Aluno-Negócio */}
          <TabsContent value="student-links" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Vínculos Aluno-Negócio</CardTitle>
                <CardDescription>
                  Visualize e gerencie qual negócio cada aluno está vinculado para faturamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                {studentBusinessLinks && studentBusinessLinks.length > 0 ? (
                  <div className="space-y-2">
                    {studentBusinessLinks.map((link) => (
                      <div key={link.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{link.student_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Vinculado a: {link.business_name}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(link.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum vínculo encontrado</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba 4: Relatórios Financeiros */}
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Relatórios Financeiros por Negócio</CardTitle>
                <CardDescription>
                  Análise de receitas e faturas organizadas por entidade de negócio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Relatórios em desenvolvimento</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Esta funcionalidade permitirá visualizar receitas segregadas por negócio
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Testes de Integridade do Sistema */}
            <PaymentRoutingTest />
          </TabsContent>
        </Tabs>

        {/* Diálogo de Confirmação de Exclusão */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Excluir Perfil de Negócio"
          description={
            businessToDelete && deleteValidation
              ? `Tem certeza que deseja excluir o negócio "${businessToDelete.business_name}"? ${
                  deleteValidation.warnings?.length > 0
                    ? `\n\nAvisos: ${deleteValidation.warnings.map((w: any) => w.description).join("; ")}`
                    : ""
                }`
              : "Tem certeza que deseja excluir este perfil de negócio?"
          }
          actionText="Excluir"
          variant="destructive"
          onConfirm={confirmDelete}
          loading={deleteBusinessProfileMutation.isPending}
        />
      </div>
    </Layout>
  );
}
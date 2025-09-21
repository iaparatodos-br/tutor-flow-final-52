import { useState } from "react";
import { Building2, Plus, ExternalLink, CreditCard, Calendar, AlertCircle } from "lucide-react";
import { useBusinessContext } from "@/contexts/BusinessContext";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function PainelNegocios() {
  const { 
    businessProfiles, 
    selectedBusinessProfile, 
    setSelectedBusinessProfile,
    loading, 
    error,
    createBusinessProfile,
    refreshBusinessProfiles
  } = useBusinessContext();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [cnpj, setCnpj] = useState("");

  const handleCreateBusiness = async () => {
    if (!businessName.trim()) {
      toast.error("Nome do negócio é obrigatório");
      return;
    }

    setCreateLoading(true);
    try {
      const result = await createBusinessProfile({
        business_name: businessName.trim(),
        cnpj: cnpj.trim() || undefined
      });

      if (result.success) {
        setIsCreateDialogOpen(false);
        setBusinessName("");
        setCnpj("");
        
        if (result.onboarding_url) {
          toast.success("Negócio criado! Redirecionando para configuração do Stripe...");
          // Redirect to Stripe onboarding
          window.open(result.onboarding_url, '_blank');
        }
      } else {
        toast.error(result.error || "Erro ao criar negócio");
      }
    } catch (err) {
      toast.error("Erro inesperado ao criar negócio");
    } finally {
      setCreateLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestão de Negócios</h1>
            <p className="text-muted-foreground">
              Gerencie seus negócios e contas de recebimento Stripe Connect
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Conectar Novo Negócio</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Conectar Novo Negócio</DialogTitle>
                <DialogDescription>
                  Crie uma nova conta Stripe Connect para receber pagamentos de um negócio.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="business_name">Nome do Negócio *</Label>
                  <Input
                    id="business_name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ex: Escola de Inglês ABC"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cnpj">CNPJ (opcional)</Label>
                  <Input
                    id="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={createLoading}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateBusiness}
                  disabled={createLoading}
                >
                  {createLoading ? "Criando..." : "Conectar Negócio"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[80px]" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : businessProfiles.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum negócio conectado</h3>
              <p className="text-muted-foreground mb-6">
                Conecte seu primeiro negócio para começar a receber pagamentos
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Conectar Primeiro Negócio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {businessProfiles.map((business) => (
              <Card 
                key={business.id}
                className={`relative ${
                  selectedBusinessProfile?.id === business.id 
                    ? 'ring-2 ring-primary' 
                    : ''
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {business.business_name}
                      </CardTitle>
                      {business.cnpj && (
                        <CardDescription>
                          CNPJ: {formatCNPJ(business.cnpj)}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant={business.is_active ? "default" : "secondary"}>
                      {business.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Criado em {formatDate(business.created_at)}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {selectedBusinessProfile?.id !== business.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBusinessProfile(business)}
                        className="flex-1"
                      >
                        Selecionar
                      </Button>
                    )}
                    
                    {selectedBusinessProfile?.id === business.id && (
                      <Badge variant="default" className="flex-1 justify-center">
                        Selecionado
                      </Badge>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Navigate to Stripe dashboard for this account
                        window.open(`https://dashboard.stripe.com/connect/accounts/${business.stripe_connect_id}`, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {businessProfiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Informações Importantes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                • Cada negócio possui sua própria conta Stripe Connect para recebimentos independentes
              </p>
              <p>
                • Alunos, aulas e faturas são organizados por negócio selecionado
              </p>
              <p>
                • Você pode alternar entre negócios usando o seletor no cabeçalho
              </p>
              <p>
                • Configure os dados bancários diretamente no dashboard do Stripe para cada negócio
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
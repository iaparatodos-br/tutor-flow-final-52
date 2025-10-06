import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Star, Clock, DollarSign } from "lucide-react";
import { ServiceModal } from "./ServiceModal";

interface ClassService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export function ClassServicesManager() {
  const { profile } = useProfile();
  const { toast } = useToast();
  
  const [services, setServices] = useState<ClassService[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ClassService | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadServices();
    }
  }, [profile?.id]);

  const loadServices = async () => {
    if (!profile?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('class_services')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Erro ao carregar serviços:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os serviços.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateService = () => {
    setEditingService(null);
    setModalOpen(true);
  };

  const handleEditService = (service: ClassService) => {
    setEditingService(service);
    setModalOpen(true);
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este serviço?')) return;

    try {
      setDeletingId(id);
      
      // Verificar se há aulas não faturadas usando este serviço
      // Isso inclui: aulas futuras, completadas não faturadas, ou canceladas com cobrança pendente
      const { count } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', id)
        .or('class_date.gte.' + new Date().toISOString() + ',and(billed.eq.false,status.eq.concluido),and(billed.eq.false,charge_applied.eq.true,cancelled_at.not.is.null)');

      if (count && count > 0) {
        toast({
          title: "Não é possível excluir",
          description: "Este serviço está vinculado a aulas futuras ou não faturadas.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('class_services')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Serviço excluído com sucesso.",
      });

      loadServices();
    } catch (error) {
      console.error('Erro ao excluir serviço:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o serviço.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('class_services')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: currentActive ? "Serviço desativado." : "Serviço ativado.",
      });

      loadServices();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status do serviço.",
        variant: "destructive",
      });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Serviços e Preços</h2>
          <p className="text-muted-foreground">
            Gerencie os diferentes tipos de aula e seus valores
          </p>
        </div>
        <Button onClick={handleCreateService}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum serviço cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro serviço para definir preços das suas aulas
            </p>
            <Button onClick={handleCreateService}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Serviço
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {services.map((service) => (
            <Card key={service.id} className={!service.is_active ? "opacity-60" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{service.name}</h3>
                      {service.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="mr-1 h-3 w-3" />
                          Padrão
                        </Badge>
                      )}
                      <Badge variant={service.is_active ? "default" : "secondary"}>
                        {service.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    
                    {service.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {service.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{formatPrice(service.price)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{service.duration_minutes} min</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(service.id, service.is_active)}
                    >
                      {service.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditService(service)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteService(service.id)}
                      disabled={deletingId === service.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ServiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        service={editingService}
        onSuccess={loadServices}
        profileId={profile?.id || ''}
      />
    </div>
  );
}
import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Clock, DollarSign } from "lucide-react";
import { ServiceModal } from "./ServiceModal";
import { useTranslation } from "react-i18next";

interface ClassService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
}

export function ClassServicesManager() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('services');
  
  const [services, setServices] = useState<ClassService[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ClassService | null>(null);
  const [showInactive, setShowInactive] = useState(false);

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




  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">{t('common:loading')}</div>;
  }

  const filteredServices = showInactive 
    ? services 
    : services.filter(s => s.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="border-l-2 border-primary/30 pl-4 py-1 my-6 max-w-3xl">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Serviços são os tipos de aulas ou atendimentos que você oferece. Aqui você define o nome <span className="italic text-primary/70">(ex: Aula Particular de Inglês)</span>, a duração padrão e o valor. Ao criar seus serviços, você agiliza a criação da agenda para facilitar o seu cotidiano.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('showInactive')}
          </label>
          <Button onClick={handleCreateService}>
            <Plus className="mr-2 h-4 w-4" />
            {t('new')}
          </Button>
        </div>
      </div>

      {filteredServices.length === 0 && !showInactive && services.length > 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              {t('noActiveServices')}
            </p>
          </CardContent>
        </Card>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('noServices')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('noServicesDescription')}
            </p>
            <Button onClick={handleCreateService}>
              <Plus className="mr-2 h-4 w-4" />
              {t('createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredServices.map((service) => (
            <Card key={service.id} className={!service.is_active ? "opacity-60" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{service.name}</h3>
                      <Badge variant={service.is_active ? "default" : "secondary"}>
                        {service.is_active ? t('active') : t('inactive')}
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
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditService(service)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
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
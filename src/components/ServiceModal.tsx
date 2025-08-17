import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface ClassService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  is_default: boolean;
}

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  service?: ClassService | null;
  onSuccess: () => void;
  profileId: string;
}

export function ServiceModal({ open, onClose, service, onSuccess, profileId }: ServiceModalProps) {
  const { toast } = useToast();
  
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration_minutes: '60',
    is_active: true,
    is_default: false,
  });

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        description: service.description || '',
        price: service.price.toString(),
        duration_minutes: service.duration_minutes.toString(),
        is_active: service.is_active,
        is_default: service.is_default,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        price: '',
        duration_minutes: '60',
        is_active: true,
        is_default: false,
      });
    }
  }, [service, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileId) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para criar um serviço.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do serviço é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.price || parseFloat(formData.price) < 0) {
      toast({
        title: "Erro",
        description: "O preço deve ser um valor válido.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.duration_minutes || parseInt(formData.duration_minutes) <= 0) {
      toast({
        title: "Erro",
        description: "A duração deve ser maior que zero.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      
      const serviceData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        duration_minutes: parseInt(formData.duration_minutes),
        is_active: formData.is_active,
        is_default: formData.is_default,
        teacher_id: profileId,
      };

      if (service) {
        // Atualizar serviço existente
        const { error } = await supabase
          .from('class_services')
          .update(serviceData)
          .eq('id', service.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Serviço atualizado com sucesso.",
        });
      } else {
        // Criar novo serviço
        const { error } = await supabase
          .from('class_services')
          .insert(serviceData);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Serviço criado com sucesso.",
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar serviço:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o serviço.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {service ? 'Editar Serviço' : 'Novo Serviço'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Serviço *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Ex: Aula Individual 60min"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Descrição opcional do serviço"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duração (min) *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder="60"
                value={formData.duration_minutes}
                onChange={(e) => handleChange('duration_minutes', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleChange('is_active', checked)}
              />
              <Label htmlFor="is_active" className="text-sm">
                Serviço ativo
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) => handleChange('is_default', checked)}
              />
              <Label htmlFor="is_default" className="text-sm">
                Definir como padrão
              </Label>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : service ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
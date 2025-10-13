import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation('services');
  
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
        title: t('messages.error'),
        description: t('validation.loginRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: t('messages.error'),
        description: t('validation.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.price || parseFloat(formData.price) < 0) {
      toast({
        title: t('messages.error'),
        description: t('validation.validPrice'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.duration_minutes || parseInt(formData.duration_minutes) <= 0) {
      toast({
        title: t('messages.error'),
        description: t('validation.validDuration'),
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
          title: t('messages.success'),
          description: t('messages.updateSuccess'),
        });
      } else {
        // Criar novo serviço
        const { error } = await supabase
          .from('class_services')
          .insert(serviceData);

        if (error) throw error;

        toast({
          title: t('messages.success'),
          description: t('messages.createSuccess'),
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar serviço:', error);
      toast({
        title: t('messages.error'),
        description: t('messages.saveError'),
        variant: "destructive",
      });
    } finally{
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
            {service ? t('edit') : t('new')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('fields.name')} *</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('fields.namePlaceholder')}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('fields.description')}</Label>
            <Textarea
              id="description"
              placeholder={t('fields.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">{t('fields.price')} *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder={t('fields.pricePlaceholder')}
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">{t('fields.duration')} *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder={t('fields.durationPlaceholder')}
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
                {t('fields.isActive')}
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) => handleChange('is_default', checked)}
              />
              <Label htmlFor="is_default" className="text-sm">
                {t('fields.isDefault')}
              </Label>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? t('actions.saving') : service ? t('actions.update') : t('actions.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
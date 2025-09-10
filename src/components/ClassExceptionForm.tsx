import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ClassService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface ClassExceptionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalClass: {
    id: string;
    title: string;
    start: Date;
    end: Date;
    duration_minutes: number;
    notes?: string;
  };
  services: ClassService[];
  onSuccess: () => void;
}

export function ClassExceptionForm({
  open,
  onOpenChange,
  originalClass,
  services,
  onSuccess
}: ClassExceptionFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    new_start_date: '',
    new_start_time: '',
    new_duration_minutes: 60,
    new_title: '',
    new_description: ''
  });

  useEffect(() => {
    if (originalClass && open) {
      const startDate = new Date(originalClass.start);
      const dateStr = startDate.toISOString().split('T')[0];
      const timeStr = startDate.toTimeString().slice(0, 5);
      
      setFormData({
        new_start_date: dateStr,
        new_start_time: timeStr,
        new_duration_minutes: originalClass.duration_minutes,
        new_title: originalClass.title,
        new_description: originalClass.notes || ''
      });
    }
  }, [originalClass, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.new_start_date || !formData.new_start_time) {
        throw new Error('Data e horário são obrigatórios');
      }

      const newStartDateTime = new Date(`${formData.new_start_date}T${formData.new_start_time}:00`);
      const newEndDateTime = new Date(newStartDateTime.getTime() + (formData.new_duration_minutes * 60 * 1000));

      const { data, error } = await supabase.functions.invoke('manage-class-exception', {
        body: {
          original_class_id: originalClass.id,
          exception_date: originalClass.start.toISOString(),
          action: 'reschedule',
          newData: {
            start_time: newStartDateTime.toISOString(),
            end_time: newEndDateTime.toISOString(),
            title: formData.new_title,
            description: formData.new_description,
            duration_minutes: formData.new_duration_minutes
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Aula reagendada",
        description: data.message || "A aula foi reagendada com sucesso",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao reagendar aula:', error);
      toast({
        title: "Erro ao reagendar",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('manage-class-exception', {
        body: {
          original_class_id: originalClass.id,
          exception_date: originalClass.start.toISOString(),
          action: 'cancel'
        }
      });

      if (error) throw error;

      toast({
        title: "Aula cancelada",
        description: data.message || "A aula foi cancelada com sucesso",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao cancelar aula:', error);
      toast({
        title: "Erro ao cancelar",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modificar Aula</DialogTitle>
          <DialogDescription>
            Modifique os detalhes desta ocorrência específica da aula recorrente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new_start_date">Nova Data</Label>
              <Input
                id="new_start_date"
                type="date"
                value={formData.new_start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, new_start_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_start_time">Novo Horário</Label>
              <Input
                id="new_start_time"
                type="time"
                value={formData.new_start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, new_start_time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_duration">Duração</Label>
            <Select value={formData.new_duration_minutes.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, new_duration_minutes: parseInt(value) }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[30, 45, 60, 75, 90, 120].map((duration) => (
                  <SelectItem key={duration} value={duration.toString()}>
                    {duration} minutos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_title">Título</Label>
            <Input
              id="new_title"
              value={formData.new_title}
              onChange={(e) => setFormData(prev => ({ ...prev, new_title: e.target.value }))}
              placeholder="Título da aula"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_description">Descrição</Label>
            <Textarea
              id="new_description"
              value={formData.new_description}
              onChange={(e) => setFormData(prev => ({ ...prev, new_description: e.target.value }))}
              placeholder="Observações sobre esta aula específica..."
              rows={3}
            />
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleCancel}
              disabled={loading}
            >
              Cancelar Aula
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Reagendar'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
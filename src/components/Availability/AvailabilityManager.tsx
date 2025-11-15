import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Plus, Settings, X, Calendar, Edit, Trash2, Info } from 'lucide-react';
import moment from 'moment';
import { useTranslation } from 'react-i18next';

interface AvailabilityBlock {
  id: string;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string;
}

interface WorkingHours {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface AvailabilityManagerProps {
  onAvailabilityChange?: () => void;
}

export function AvailabilityManager({ onAvailabilityChange }: AvailabilityManagerProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('availability');
  
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isWorkingHoursDialogOpen, setIsWorkingHoursDialogOpen] = useState(false);
  
  const [newBlock, setNewBlock] = useState({
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: ''
  });

  const [selectedWorkingHour, setSelectedWorkingHour] = useState<WorkingHours | null>(null);

  const DAYS_OF_WEEK = [
    { value: 0, label: t('daysOfWeek.sunday') },
    { value: 1, label: t('daysOfWeek.monday') },
    { value: 2, label: t('daysOfWeek.tuesday') },
    { value: 3, label: t('daysOfWeek.wednesday') },
    { value: 4, label: t('daysOfWeek.thursday') },
    { value: 5, label: t('daysOfWeek.friday') },
    { value: 6, label: t('daysOfWeek.saturday') }
  ];

  useEffect(() => {
    if (profile?.id) {
      loadAvailabilityData();
    }
  }, [profile?.id]);

  const loadAvailabilityData = async () => {
    if (!profile?.id) return;

    try {
      // Load availability blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from('availability_blocks')
        .select('*')
        .eq('teacher_id', profile.id)
        .gte('end_datetime', new Date().toISOString())
        .order('start_datetime');

      if (blocksError) throw blocksError;

      // Load working hours
      const { data: hoursData, error: hoursError } = await supabase
        .from('working_hours')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('day_of_week');

      if (hoursError) throw hoursError;

      setBlocks(blocksData || []);
      setWorkingHours(hoursData || []);
    } catch (error) {
      console.error('Erro ao carregar dados de disponibilidade:', error);
      toast({
        title: t('common:error'),
        description: t('messages.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile?.id || !newBlock.title || !newBlock.start_date || !newBlock.start_time || !newBlock.end_date || !newBlock.end_time) {
      toast({
        title: t('common:error'),
        description: t('messages.requiredFields'),
        variant: "destructive",
      });
      return;
    }

    try {
      const startDateTime = new Date(`${newBlock.start_date}T${newBlock.start_time}`);
      const endDateTime = new Date(`${newBlock.end_date}T${newBlock.end_time}`);

      if (endDateTime <= startDateTime) {
        toast({
          title: t('common:error'),
          description: t('messages.invalidDateTime'),
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('availability_blocks')
        .insert({
          teacher_id: profile.id,
          title: newBlock.title,
          description: newBlock.description || null,
          start_datetime: startDateTime.toISOString(),
          end_datetime: endDateTime.toISOString()
        });

      if (error) throw error;

      toast({
        title: t('common:success'),
        description: t('messages.addSuccess'),
      });

      setIsBlockDialogOpen(false);
      setNewBlock({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        end_date: '',
        end_time: ''
      });

      await loadAvailabilityData();
      onAvailabilityChange?.();
    } catch (error) {
      console.error('Erro ao adicionar bloqueio:', error);
      toast({
        title: t('common:error'),
        description: t('messages.addError'),
        variant: "destructive",
      });
    }
  };

  const handleDeleteBlock = async (id: string) => {
    try {
      const { error } = await supabase
        .from('availability_blocks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: t('common:success'),
        description: t('messages.deleteSuccess'),
      });

      await loadAvailabilityData();
      onAvailabilityChange?.();
    } catch (error) {
      console.error('Erro ao remover bloqueio:', error);
      toast({
        title: t('common:error'),
        description: t('messages.deleteError'),
        variant: "destructive",
      });
    }
  };

  const handleUpdateWorkingHours = async (dayOfWeek: number, startTime: string, endTime: string, isActive: boolean) => {
    if (!profile?.id) return;

    try {
      // Check if working hours already exist for this day
      const existingHour = workingHours.find(h => h.day_of_week === dayOfWeek);

      if (existingHour) {
        // Update existing
        const { error } = await supabase
          .from('working_hours')
          .update({
            start_time: startTime,
            end_time: endTime,
            is_active: isActive
          })
          .eq('id', existingHour.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('working_hours')
          .insert({
            teacher_id: profile.id,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime,
            is_active: isActive
          });

        if (error) throw error;
      }

      await loadAvailabilityData();
      onAvailabilityChange?.();
    } catch (error) {
      console.error('Erro ao atualizar horário de trabalho:', error);
      toast({
        title: t('common:error'),
        description: t('messages.updateError'),
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateTime: string) => {
    return moment(dateTime).format('DD/MM/YYYY HH:mm');
  };

  const getWorkingHoursForDay = (dayOfWeek: number) => {
    return workingHours.find(h => h.day_of_week === dayOfWeek);
  };

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">{t('messages.loading')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Working Hours Configuration */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('workingHours.title')}
            <span className="text-xs text-muted-foreground font-normal">{t('workingHours.timezone')}</span>
          </CardTitle>
          <Dialog open={isWorkingHoursDialogOpen} onOpenChange={setIsWorkingHoursDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                {t('workingHours.configure')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{t('workingHours.dialogTitle')}</DialogTitle>
                <p className="text-sm text-muted-foreground">{t('workingHours.dialogDescription')}</p>
              </DialogHeader>
              
              <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100">
                  {t('workingHours.timeHint.title')}
                </AlertTitle>
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                  {t('workingHours.timeHint.description')}
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const existingHours = getWorkingHoursForDay(day.value);
                  return (
                    <WorkingHourRow
                      key={day.value}
                      day={day}
                      existingHours={existingHours}
                      onUpdate={handleUpdateWorkingHours}
                    />
                  );
                })}
              </div>
              
              <div className="flex justify-end">
                <Button onClick={() => setIsWorkingHoursDialogOpen(false)}>
                  {t('workingHours.done')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DAYS_OF_WEEK.map((day) => {
              const hours = getWorkingHoursForDay(day.value);
              return (
                <div key={day.value} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-medium">{day.label}</span>
                  {hours?.is_active ? (
                    <Badge variant="default">
                      {hours.start_time.slice(0, 5)} - {hours.end_time.slice(0, 5)}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t('workingHours.unavailable')}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Availability Blocks */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('blocks.title')} {t('blocks.count', { count: blocks.length })}
          </CardTitle>
          <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('blocks.new')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('blocks.add')}</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleAddBlock} className="space-y-4">
                <div>
                  <Label htmlFor="title">{t('blocks.fields.title.label')} *</Label>
                  <Input
                    id="title"
                    value={newBlock.title}
                    onChange={(e) => setNewBlock(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={t('blocks.fields.title.placeholder')}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">{t('blocks.fields.description.label')}</Label>
                  <Textarea
                    id="description"
                    value={newBlock.description}
                    onChange={(e) => setNewBlock(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('blocks.fields.description.placeholder')}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_date">{t('blocks.fields.startDate.label')} *</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={newBlock.start_date}
                      onChange={(e) => setNewBlock(prev => ({ ...prev, start_date: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="start_time">{t('blocks.fields.startTime.label')} *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={newBlock.start_time}
                      onChange={(e) => setNewBlock(prev => ({ ...prev, start_time: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="end_date">{t('blocks.fields.endDate.label')} *</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={newBlock.end_date}
                      onChange={(e) => setNewBlock(prev => ({ ...prev, end_date: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_time">{t('blocks.fields.endTime.label')} *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={newBlock.end_time}
                      onChange={(e) => setNewBlock(prev => ({ ...prev, end_time: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsBlockDialogOpen(false)}>
                    {t('blocks.actions.cancel')}
                  </Button>
                  <Button type="submit">
                    {t('blocks.actions.add')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('blocks.empty.title')}</h3>
              <p className="text-muted-foreground">
                {t('blocks.empty.description')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('blocks.table.title')}</TableHead>
                  <TableHead>{t('blocks.table.period')}</TableHead>
                  <TableHead>{t('blocks.table.description')}</TableHead>
                  <TableHead>{t('blocks.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.map((block) => (
                  <TableRow key={block.id}>
                    <TableCell className="font-medium">{block.title}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{formatDateTime(block.start_datetime)}</div>
                        <div className="text-muted-foreground">
                          {t('blocks.table.until')} {formatDateTime(block.end_datetime)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {block.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteBlock(block.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface WorkingHourRowProps {
  day: { value: number; label: string };
  existingHours?: WorkingHours;
  onUpdate: (dayOfWeek: number, startTime: string, endTime: string, isActive: boolean) => void;
}

function WorkingHourRow({ day, existingHours, onUpdate }: WorkingHourRowProps) {
  const { t } = useTranslation('availability');
  const [isActive, setIsActive] = useState(existingHours?.is_active ?? false);
  const [startTime, setStartTime] = useState(existingHours?.start_time || '09:00');
  const [endTime, setEndTime] = useState(existingHours?.end_time || '18:00');

  const handleSave = () => {
    onUpdate(day.value, startTime, endTime, isActive);
  };

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="flex items-center gap-2 min-w-[100px]">
        <Switch 
          checked={isActive} 
          onCheckedChange={setIsActive}
          onBlur={handleSave}
        />
        <span className="font-medium">{day.label}</span>
      </div>
      
      {isActive && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-sm">De:</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onBlur={handleSave}
              className="w-24"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Até:</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              onBlur={handleSave}
              className="w-24"
            />
          </div>
        </>
      )}
      
      {!isActive && (
        <span className="text-muted-foreground text-sm">{t('workingHours.unavailable')}</span>
      )}
    </div>
  );
}
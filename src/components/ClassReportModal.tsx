import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CalendarClass } from '@/components/Calendar/CalendarView';
import { useProfile } from '@/contexts/ProfileContext';
import { BookOpen, FileText, Link, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ClassReportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: CalendarClass | null;
  onReportCreated?: () => void;
}

interface ClassReport {
  id: string;
  lesson_summary: string;
  homework: string;
  extra_materials: string;
}

interface StudentFeedback {
  student_id: string;
  feedback: string;
}

export function ClassReportModal({ 
  isOpen, 
  onOpenChange, 
  classData, 
  onReportCreated 
}: ClassReportModalProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('reports');
  
  const [loading, setLoading] = useState(false);
  const [existingReport, setExistingReport] = useState<ClassReport | null>(null);
  
  // Form data
  const [lessonSummary, setLessonSummary] = useState('');
  const [homework, setHomework] = useState('');
  const [extraMaterials, setExtraMaterials] = useState('');
  const [feedbacks, setFeedbacks] = useState<StudentFeedback[]>([]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen && classData) {
      loadExistingReport();
    } else if (!isOpen) {
      resetForm();
    }
  }, [isOpen, classData]);

  const resetForm = () => {
    setLessonSummary('');
    setHomework('');
    setExtraMaterials('');
    setFeedbacks([]);
    setExistingReport(null);
  };

  const loadExistingReport = async () => {
    if (!classData?.id) return;

    // Se for virtual, não consultar banco (ainda não existe relatório)
    if (classData.id.includes('_virtual_')) {
      initializeFeedbacks();
      return;
    }

    try {
      const { data: report, error } = await supabase
        .from('class_reports')
        .select('*')
        .eq('class_id', classData.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading report:', error);
        initializeFeedbacks();
        return;
      }

      if (report) {
        setExistingReport(report);
        setLessonSummary(report.lesson_summary || '');
        setHomework(report.homework || '');
        setExtraMaterials(report.extra_materials || '');

        // Load individual feedbacks
        const { data: feedbackData, error: feedbackError } = await supabase
          .from('class_report_feedbacks')
          .select('student_id, feedback')
          .eq('report_id', report.id);

        if (feedbackError) {
          console.error('Error loading feedbacks:', feedbackError);
          initializeFeedbacks();
          return;
        }

        // CORREÇÃO: Sempre mesclar feedbacks do banco com lista completa de participantes
        const participants = classData.participants || [];
        
        if (feedbackData && feedbackData.length > 0) {
          // Criar array mesclado: todos os participantes com feedbacks (existentes ou vazios)
          const mergedFeedbacks = participants.map(p => {
            const existingFeedback = feedbackData.find(f => f.student_id === p.student_id);
            return {
              student_id: p.student_id,
              feedback: existingFeedback?.feedback || ''
            };
          });
          
          console.log('🔄 Merged feedbacks loaded:', mergedFeedbacks);
          setFeedbacks(mergedFeedbacks);
        } else {
          initializeFeedbacks();
        }
      } else {
        initializeFeedbacks();
      }
    } catch (error) {
      console.error('Error loading existing report:', error);
      initializeFeedbacks();
    }
  };

  const initializeFeedbacks = () => {
    if (!classData) return;

    // Use only participants array (no legacy fallback)
    const participants = classData.participants || [];

    const initialFeedbacks = participants.map(p => ({
      student_id: p.student_id,
      feedback: ''
    }));

    setFeedbacks(initialFeedbacks);
  };

  const updateFeedback = (studentId: string, feedback: string) => {
    console.log('🔍 updateFeedback called:', { studentId, feedback, currentFeedbacksCount: feedbacks.length });
    setFeedbacks(prev => 
      prev.map(f => 
        f.student_id === studentId ? { ...f, feedback } : f
      )
    );
  };

  const handleSubmit = async () => {
    if (!classData || !profile) return;
    
    if (!lessonSummary.trim()) {
      toast({
        title: t('modal.messages.error'),
        description: t('modal.messages.requiredField'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      let finalClassId = classData.id;
      
      // PASSO 1: Se for virtual, materializar AGORA
      if (classData.id.includes('_virtual_')) {
        const targetStatus: 'confirmada' | 'concluida' = 
          classData.status === 'concluida' ? 'concluida' : 'confirmada';
        
        const templateId = classData.class_template_id || classData.id.split('_virtual_')[0];
        
        // Calcular duração em minutos a partir do start/end
        const durationMinutes = Math.round(
          (classData.end.getTime() - classData.start.getTime()) / (1000 * 60)
        );
        
        const realClassData = {
          teacher_id: profile.id,
          // student_id REMOVED - use class_participants instead
          service_id: (classData as any).service_id || null,
          class_date: classData.start.toISOString(),
          duration_minutes: durationMinutes,
          notes: classData.notes || null,
          status: targetStatus,
          is_experimental: classData.is_experimental || false,
          is_group_class: classData.is_group_class || false,
          is_template: false,
          class_template_id: templateId
        };
        
        const { data: newClass, error: materializeError } = await supabase
          .from('classes')
          .insert([realClassData])
          .select()
          .single();
        
        if (materializeError) throw materializeError;
        
        // ALWAYS create participants (both group and individual classes)
        if (classData.participants?.length > 0) {
          const participantInserts = classData.participants.map((p: any) => ({
            class_id: newClass.id,
            student_id: p.student_id,
            status: targetStatus,
            confirmed_at: targetStatus === 'confirmada' || targetStatus === 'concluida' 
              ? new Date().toISOString() 
              : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
          
          const { error: participantError } = await supabase
            .from('class_participants')
            .insert(participantInserts);
          
          if (participantError) {
            console.error('Error creating participants for materialized class:', participantError);
            throw participantError;
          }
          
          console.log(`Created ${participantInserts.length} participant(s) for materialized class`);
        } else {
          console.warn('No participants found in virtual class data');
        }
        
        // Usar o ID real daqui pra frente
        finalClassId = newClass.id;
      }
      
      // PASSO 2: Salvar relatório com ID real
      let reportId = existingReport?.id;

      if (existingReport) {
        // Update existing report
        const { error: updateError } = await supabase
          .from('class_reports')
          .update({
            lesson_summary: lessonSummary,
            homework: homework || null,
            extra_materials: extraMaterials || null,
          })
          .eq('id', existingReport.id);

        if (updateError) throw updateError;
      } else {
        // Create new report - usar finalClassId (real)
        const { data: newReport, error: insertError } = await supabase
          .from('class_reports')
          .insert({
            class_id: finalClassId,
            teacher_id: profile.id,
            lesson_summary: lessonSummary,
            homework: homework || null,
            extra_materials: extraMaterials || null,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        reportId = newReport.id;
      }

      // Handle individual feedbacks (if any)
      const feedbacksToSave = feedbacks.filter(f => f.feedback.trim());
      
      if (feedbacksToSave.length > 0) {
        // Delete existing feedbacks for this report
        const { error: deleteError } = await supabase
          .from('class_report_feedbacks')
          .delete()
          .eq('report_id', reportId!);

        if (deleteError) throw deleteError;

        // Insert new feedbacks
        const { error: feedbackError } = await supabase
          .from('class_report_feedbacks')
          .insert(
            feedbacksToSave.map(f => ({
              report_id: reportId!,
              student_id: f.student_id,
              feedback: f.feedback
            }))
          );

        if (feedbackError) throw feedbackError;
      }

      // Send notifications (call edge function) - usar finalClassId
      try {
        await supabase.functions.invoke('send-class-report-notification', {
          body: { 
            classId: finalClassId,
            reportId: reportId!
          }
        });
      } catch (notificationError) {
        console.warn('Error sending notifications:', notificationError);
        // Don't fail the whole operation if notifications fail
      }

      toast({
        title: t('common:success'),
        description: existingReport 
          ? t('modal.messages.updateSuccess')
          : t('modal.messages.createSuccess'),
      });

      // Chamar callback se fornecido (para materializar aula virtual)
      if (onReportCreated) {
        onReportCreated();
      } else {
        onOpenChange(false);
      }

    } catch (error: any) {
      console.error('Error saving report:', error);
      toast({
        title: t('common:error'),
        description: error.message || t('modal.messages.error'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!classData) return null;

  // Use only participants array (no legacy fallback)
  const participants = classData.participants || [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        key={`report-${classData.id}-${existingReport?.id || 'new'}`}
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {existingReport ? t('modal.title.edit') : t('modal.title.create')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Class Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t('modal.classInfo.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <strong>{t('modal.classInfo.students')}</strong>{' '}
                {participants.map(p => p.student.name).join(', ')}
              </div>
              <div>
                <strong>{t('modal.classInfo.date')}</strong>{' '}
                {new Date(classData.start).toLocaleDateString('pt-BR')}
              </div>
              <div>
                <strong>{t('modal.classInfo.time')}</strong>{' '}
                {new Date(classData.start).toLocaleTimeString('pt-BR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })} -{' '}
                {new Date(classData.end).toLocaleTimeString('pt-BR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })} <span className="text-xs text-muted-foreground">{t('modal.classInfo.timezone')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Lesson Summary */}
          <div className="space-y-2">
            <Label htmlFor="lesson-summary" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('modal.fields.lessonSummary.label')} *
            </Label>
            <Textarea
              id="lesson-summary"
              placeholder={t('modal.fields.lessonSummary.placeholder')}
              value={lessonSummary}
              onChange={(e) => setLessonSummary(e.target.value)}
              className="min-h-[100px]"
              required
              style={{
                scrollBehavior: 'auto',
                pointerEvents: 'auto',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              }}
            />
          </div>

          {/* Homework */}
          <div className="space-y-2">
            <Label htmlFor="homework" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t('modal.fields.homework.label')}
            </Label>
            <Textarea
              id="homework"
              placeholder={t('modal.fields.homework.placeholder')}
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
              className="min-h-[80px]"
              style={{
                scrollBehavior: 'auto',
                pointerEvents: 'auto',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              }}
            />
          </div>

          {/* Extra Materials */}
          <div className="space-y-2">
            <Label htmlFor="materials" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              {t('modal.fields.extraMaterials.label')}
            </Label>
            <Textarea
              id="materials"
              placeholder={t('modal.fields.extraMaterials.placeholder')}
              value={extraMaterials}
              onChange={(e) => setExtraMaterials(e.target.value)}
              className="min-h-[80px]"
              style={{
                scrollBehavior: 'auto',
                pointerEvents: 'auto',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              }}
            />
          </div>

          {/* Individual Feedbacks */}
          {participants.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  {t('modal.fields.individualFeedback.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('modal.fields.individualFeedback.description')}
                </p>
                
                {participants.map((participant) => {
                  const feedback = feedbacks.find(f => f.student_id === participant.student_id);
                  console.log('🎨 Rendering feedback for:', participant.student.name, 'value:', feedback?.feedback || '(empty)', 'found:', !!feedback);
                  
                  return (
                    <div key={participant.student_id} className="space-y-2">
                      <Label className="text-sm font-medium">
                        {participant.student.name}
                      </Label>
                      <Textarea
                        key={`feedback-${participant.student_id}-${existingReport?.id || 'new'}`}
                        placeholder={t('modal.fields.individualFeedback.placeholder', { name: participant.student.name })}
                        value={feedback?.feedback || ''}
                        onChange={(e) => updateFeedback(participant.student_id, e.target.value)}
                        className="min-h-[80px]"
                        style={{
                          scrollBehavior: 'auto',
                          pointerEvents: 'auto',
                          userSelect: 'text',
                          WebkitUserSelect: 'text'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('modal.actions.cancel')}
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={loading || !lessonSummary.trim()}
            >
              {loading ? t('modal.actions.saving') : existingReport ? t('modal.actions.update') : t('modal.actions.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
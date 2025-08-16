import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  BookOpen, 
  FileText, 
  Link as LinkIcon, 
  MessageSquare, 
  Calendar,
  Clock,
  Edit3
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ClassReportViewProps {
  classId: string;
  onEditReport?: () => void;
  showEditButton?: boolean;
}

interface ClassReport {
  id: string;
  lesson_summary: string;
  homework: string | null;
  extra_materials: string | null;
  created_at: string;
  updated_at: string;
}

interface StudentFeedback {
  student_id: string;
  feedback: string;
  student_name?: string;
}

export function ClassReportView({ 
  classId, 
  onEditReport, 
  showEditButton = false 
}: ClassReportViewProps) {
  const { profile, isProfessor } = useAuth();
  
  const [report, setReport] = useState<ClassReport | null>(null);
  const [feedbacks, setFeedbacks] = useState<StudentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [classId]);

  const loadReport = async () => {
    if (!classId) return;

    setLoading(true);
    setError(null);

    try {
      // Load main report
      const { data: reportData, error: reportError } = await supabase
        .from('class_reports')
        .select('*')
        .eq('class_id', classId)
        .single();

      if (reportError) {
        if (reportError.code === 'PGRST116') {
          setError('Nenhum relato encontrado para esta aula');
        } else {
          throw reportError;
        }
        return;
      }

      setReport(reportData);

      // Load individual feedbacks
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('class_report_feedbacks')
        .select('student_id, feedback')
        .eq('report_id', reportData.id);

      if (feedbackError) {
        console.error('Error loading feedbacks:', feedbackError);
      } else {
        // Get student names for feedbacks
        const studentIds = feedbackData?.map(f => f.student_id) || [];
        let studentNames: { [key: string]: string } = {};
        
        if (studentIds.length > 0) {
          const { data: students } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', studentIds);
          
          students?.forEach(student => {
            studentNames[student.id] = student.name;
          });
        }

        const mappedFeedbacks = feedbackData?.map(f => ({
          student_id: f.student_id,
          feedback: f.feedback,
          student_name: studentNames[f.student_id] || 'Aluno'
        })) || [];

        // Filter feedbacks based on user permissions
        let filteredFeedbacks = mappedFeedbacks;
        
        if (!isProfessor && profile?.id) {
          // Students/guardians can only see their own feedback
          filteredFeedbacks = mappedFeedbacks.filter(f => 
            f.student_id === profile.id
          );
        }

        setFeedbacks(filteredFeedbacks);
      }

    } catch (err: any) {
      console.error('Error loading report:', err);
      setError(err.message || 'Erro ao carregar relato');
    } finally {
      setLoading(false);
    }
  };

  const formatLinks = (text: string) => {
    if (!text) return text;
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={index} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              {error || 'Nenhum relato disponível'}
            </h3>
            <p className="text-muted-foreground">
              {isProfessor 
                ? "O relato da aula será exibido aqui após ser criado"
                : "O professor ainda não criou um relato para esta aula"
              }
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Report Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Relato da Aula
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(report.created_at).toLocaleDateString('pt-BR')}
              </Badge>
              {showEditButton && isProfessor && onEditReport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditReport}
                  className="flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lesson Summary */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Resumo da Aula
            </h4>
            <p className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
              {report.lesson_summary}
            </p>
          </div>

          {/* Homework */}
          {report.homework && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Tarefas
              </h4>
              <p className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                {report.homework}
              </p>
            </div>
          )}

          {/* Extra Materials */}
          {report.extra_materials && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Materiais e Links
              </h4>
              <div className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                {formatLinks(report.extra_materials)}
              </div>
            </div>
          )}

          {/* Updated timestamp */}
          {report.updated_at !== report.created_at && (
            <div className="text-xs text-muted-foreground">
              Atualizado em {new Date(report.updated_at).toLocaleString('pt-BR')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Feedbacks */}
      {feedbacks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {isProfessor ? 'Feedbacks Individuais' : 'Seu Feedback'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedbacks.map((feedback, index) => (
              <div key={feedback.student_id} className="space-y-2">
                {isProfessor && (
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Badge variant="secondary">{feedback.student_name}</Badge>
                  </div>
                )}
                <p className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                  {feedback.feedback}
                </p>
                {index < feedbacks.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
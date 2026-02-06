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
  Edit3,
  Baby
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { ClassReportPhotoGallery } from '@/components/ClassReportPhotoGallery';

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
  dependent_id: string | null;
  feedback: string;
  student_name?: string;
  dependent_name?: string;
}

interface Dependent {
  id: string;
  name: string;
  responsible_id: string;
}

export function ClassReportView({ 
  classId, 
  onEditReport, 
  showEditButton = false 
}: ClassReportViewProps) {
  const { profile, isProfessor } = useAuth();
  const { t, i18n } = useTranslation('reports');
  
  const [report, setReport] = useState<ClassReport | null>(null);
  const [feedbacks, setFeedbacks] = useState<StudentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userDependents, setUserDependents] = useState<Dependent[]>([]);

  useEffect(() => {
    loadReport();
    if (!isProfessor && profile?.id) {
      loadUserDependents();
    }
  }, [classId, profile?.id, isProfessor]);

  const loadUserDependents = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('dependents')
        .select('id, name, responsible_id')
        .eq('responsible_id', profile.id);

      if (error) {
        console.error('Error loading user dependents:', error);
        return;
      }

      setUserDependents(data || []);
    } catch (err) {
      console.error('Error loading user dependents:', err);
    }
  };

  const loadReport = async () => {
    if (!classId) return;

    // Se for virtual, não tem relatório no banco ainda
    if (classId.includes('_virtual_')) {
      setLoading(false);
      return;
    }

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
          setError(t('view.error'));
        } else {
          throw reportError;
        }
        return;
      }

      setReport(reportData);

      // Load individual feedbacks with dependent_id
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('class_report_feedbacks')
        .select('student_id, dependent_id, feedback')
        .eq('report_id', reportData.id);

      if (feedbackError) {
        console.error('Error loading feedbacks:', feedbackError);
      } else {
        // Get student names for feedbacks
        const studentIds = feedbackData?.map(f => f.student_id) || [];
        const dependentIds = feedbackData?.filter(f => f.dependent_id).map(f => f.dependent_id) || [];
        
        let studentNames: { [key: string]: string } = {};
        let dependentNames: { [key: string]: string } = {};
        
        // Fetch student names
        if (studentIds.length > 0) {
          const { data: students } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', studentIds);
          
          students?.forEach(student => {
            studentNames[student.id] = student.name;
          });
        }

        // Fetch dependent names
        if (dependentIds.length > 0) {
          const { data: dependents } = await supabase
            .from('dependents')
            .select('id, name')
            .in('id', dependentIds as string[]);
          
          dependents?.forEach(dep => {
            dependentNames[dep.id] = dep.name;
          });
        }

        const mappedFeedbacks: StudentFeedback[] = feedbackData?.map(f => ({
          student_id: f.student_id,
          dependent_id: f.dependent_id,
          feedback: f.feedback,
          student_name: studentNames[f.student_id] || t('view.studentLabel'),
          dependent_name: f.dependent_id ? dependentNames[f.dependent_id] : undefined
        })) || [];

        // Filter feedbacks based on user permissions
        let filteredFeedbacks = mappedFeedbacks;
        
        if (!isProfessor && profile?.id) {
          // Students/guardians can only see:
          // 1. Their own feedback (student_id matches)
          // 2. Feedback for their dependents (dependent belongs to them)
          filteredFeedbacks = mappedFeedbacks.filter(f => {
            // Direct feedback for the student
            if (f.student_id === profile.id && !f.dependent_id) return true;
            
            // Feedback for one of their dependents
            if (f.dependent_id && userDependents.some(d => d.id === f.dependent_id)) return true;
            
            return false;
          });
        }

        setFeedbacks(filteredFeedbacks);
      }

    } catch (err: any) {
      console.error('Error loading report:', err);
      setError(err.message || t('common:error'));
    } finally {
      setLoading(false);
    }
  };

  // Reload feedbacks when userDependents changes
  useEffect(() => {
    if (report && userDependents.length > 0 && !isProfessor) {
      loadReport();
    }
  }, [userDependents]);

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
              {t('view.empty.title')}
            </h3>
            <p className="text-muted-foreground">
              {isProfessor 
                ? t('view.empty.descriptionProfessor')
                : t('view.empty.descriptionStudent')
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
              {t('view.title')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(report.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'pt-BR')}
              </Badge>
              {showEditButton && isProfessor && onEditReport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditReport}
                  className="flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  {t('view.actions.edit')}
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
              {t('view.sections.lessonSummary')}
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
                {t('view.sections.homework')}
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
                {t('view.sections.materials')}
              </h4>
              <div className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                {formatLinks(report.extra_materials)}
              </div>
            </div>
          )}

          {/* Updated timestamp */}
          {report.updated_at !== report.created_at && (
            <div className="text-xs text-muted-foreground">
              {t('view.updatedAt', { 
                date: new Date(report.updated_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'pt-BR') 
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Gallery */}
      {report && <ClassReportPhotoGallery reportId={report.id} />}

      {/* Individual Feedbacks */}
      {feedbacks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {isProfessor ? t('view.sections.feedback.title') : t('view.sections.feedback.titleStudent')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedbacks.map((feedback, index) => (
              <div key={`${feedback.student_id}-${feedback.dependent_id || 'self'}`} className="space-y-2">
                {isProfessor && (
                  <div className="font-medium text-sm flex items-center gap-2">
                    {feedback.dependent_name ? (
                      <>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Baby className="h-3 w-3" />
                          {feedback.dependent_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          (resp: {feedback.student_name})
                        </span>
                      </>
                    ) : (
                      <Badge variant="secondary">{feedback.student_name}</Badge>
                    )}
                  </div>
                )}
                {!isProfessor && feedback.dependent_name && (
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Baby className="h-3 w-3" />
                      Feedback de {feedback.dependent_name}
                    </Badge>
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
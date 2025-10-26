import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface LegalDocument {
  id: string;
  title: string;
  description: string;
  file_name: string;
  version: string;
  published_at: string;
  document_type: string;
}

export default function Legal() {
  const { t } = useTranslation('legal');
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const { data, error } = await supabase
        .from('legal_documents')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading legal documents:', error);
      toast.error(t('toast.error'));
    } finally {
      setLoading(false);
    }
  }

  function getDocumentUrl(fileName: string): string {
    const { data } = supabase.storage
      .from('legal_documents')
      .getPublicUrl(fileName);
    return data.publicUrl;
  }

  function handleDownload(fileName: string, title: string) {
    const url = getDocumentUrl(fileName);
    window.open(url, '_blank');
    toast.success(t('toast.opening', { title }));
  }

  if (loading) {
    return (
      <div className="container max-w-6xl py-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">
          {t('pageTitle')}
        </h1>
        <p className="text-lg text-muted-foreground">
          {t('pageDescription')}
        </p>
      </div>

      {/* Lista de Documentos */}
      <div className="grid gap-6 md:grid-cols-2">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <CardTitle className="text-xl leading-tight">
                    {doc.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {t('publishedOn')} {format(new Date(doc.published_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <CardDescription className="text-sm leading-relaxed">
                {doc.description}
              </CardDescription>
              
              <div className="flex items-center justify-between pt-2 border-t mt-auto">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('version')} {doc.version}
                </span>
                <Button
                  onClick={() => handleDownload(doc.file_name, doc.title)}
                  size="sm"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {t('downloadPdf')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      <Card className="bg-muted/50">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('contact.title')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('contact.description', { 
                  email: (
                    <a 
                      href="mailto:legal@tutorflow.com.br" 
                      className="text-primary hover:underline font-medium"
                    >
                      legal@tutorflow.com.br
                    </a>
                  )
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

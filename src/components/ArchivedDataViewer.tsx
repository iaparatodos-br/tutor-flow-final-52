import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Archive, Calendar, Clock, FileText, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ArchivedClass {
  id: string;
  student_id: string;
  class_date: string;
  duration_minutes: number;
  status: string;
  notes?: string;
  service_id?: string;
}

interface ArchivedReport {
  id: string;
  lesson_summary: string;
  homework?: string;
  extra_materials?: string;
  created_at: string;
}

interface ArchivedData {
  classes: ArchivedClass[];
  reports: ArchivedReport[];
  metadata: {
    archivedAt: string;
    totalClasses: number;
    totalReports: number;
    period: string;
  };
}

export function ArchivedDataViewer() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [archivedData, setArchivedData] = useState<ArchivedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i - 1);
  const months = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const fetchArchivedData = async () => {
    if (!selectedYear || !selectedMonth || !user) {
      toast.error("Selecione ano e mês para buscar dados arquivados");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-archived-data', {
        body: {
          userId: user.id,
          year: parseInt(selectedYear),
          month: parseInt(selectedMonth)
        }
      });

      if (error) throw error;

      if (data.found) {
        setArchivedData(data.data);
        toast.success("Dados arquivados carregados com sucesso");
      } else {
        setArchivedData(null);
        toast.info("Nenhum dado arquivado encontrado para este período");
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados arquivados:", error);
      toast.error("Erro ao carregar dados arquivados");
      setArchivedData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      'confirmada': { label: 'Confirmada', variant: 'default' as const },
      'pendente': { label: 'Pendente', variant: 'secondary' as const },
      'cancelada': { label: 'Cancelada', variant: 'destructive' as const },
      'concluida': { label: 'Concluída', variant: 'outline' as const },
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { label: status, variant: 'secondary' as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Archive className="h-4 w-4" />
          Histórico Arquivado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Histórico de Aulas Arquivadas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Buscar Dados Arquivados</CardTitle>
              <CardDescription>
                Dados com mais de 18 meses são automaticamente arquivados para otimizar a performance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Ano</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Mês</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(month => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={fetchArchivedData} 
                  disabled={loading || !selectedYear || !selectedMonth}
                  className="gap-2"
                >
                  {loading ? "Carregando..." : "Buscar"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Dados Arquivados */}
          {archivedData && (
            <div className="space-y-4">
              {/* Metadados */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Resumo do Período: {selectedYear}/{selectedMonth}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {archivedData.metadata.totalClasses}
                      </div>
                      <div className="text-sm text-muted-foreground">Aulas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {archivedData.metadata.totalReports}
                      </div>
                      <div className="text-sm text-muted-foreground">Relatórios</div>
                    </div>
                    <div className="text-center col-span-2">
                      <div className="text-sm text-muted-foreground">
                        Arquivado em: {formatDateTime(archivedData.metadata.archivedAt)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de Aulas */}
              {archivedData.classes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Aulas ({archivedData.classes.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {archivedData.classes.map((classItem, index) => (
                        <div key={classItem.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4" />
                                <span className="font-medium">
                                  {formatDateTime(classItem.class_date)}
                                </span>
                                <Clock className="h-4 w-4 ml-2" />
                                <span>{classItem.duration_minutes} min</span>
                              </div>
                              {classItem.notes && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  {classItem.notes}
                                </p>
                              )}
                            </div>
                            <div>
                              {getStatusBadge(classItem.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista de Relatórios */}
              {archivedData.reports.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Relatórios de Aula ({archivedData.reports.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {archivedData.reports.map((report, index) => (
                        <div key={report.id} className="border rounded-lg p-4">
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-medium mb-2">Resumo da Aula</h4>
                              <p className="text-sm">{report.lesson_summary}</p>
                            </div>
                            
                            {report.homework && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-medium mb-2">Tarefa de Casa</h4>
                                  <p className="text-sm">{report.homework}</p>
                                </div>
                              </>
                            )}
                            
                            {report.extra_materials && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-medium mb-2">Materiais Extras</h4>
                                  <div className="text-sm whitespace-pre-wrap">
                                    {report.extra_materials}
                                  </div>
                                </div>
                              </>
                            )}
                            
                            <Separator />
                            <div className="text-xs text-muted-foreground">
                              Criado em: {formatDateTime(report.created_at)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {selectedYear && selectedMonth && !archivedData && !loading && (
            <Card>
              <CardContent className="text-center py-8">
                <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhum dado arquivado encontrado para {selectedMonth}/{selectedYear}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
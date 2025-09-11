import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, Calendar, FileText, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ArchivedClass {
  id: string;
  class_date: string;
  student_id?: string;
  teacher_id: string;
  duration_minutes: number;
  status: string;
  notes?: string;
  service_id?: string;
  class_reports?: ArchivedClassReport[];
}

interface ArchivedClassReport {
  id: string;
  class_id: string;
  teacher_id: string;
  lesson_summary: string;
  homework?: string;
  extra_materials?: string;
  created_at: string;
}

export default function Historico() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [archivedData, setArchivedData] = useState<ArchivedClass[]>([]);
  const [selectedReport, setSelectedReport] = useState<ArchivedClassReport | null>(null);

  // Gerar anos disponíveis (últimos 5 anos até 18 meses atrás)
  const generateAvailableYears = () => {
    const currentDate = new Date();
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(currentDate.getMonth() - 18);
    
    const endYear = eighteenMonthsAgo.getFullYear();
    const startYear = endYear - 4; // 5 anos para trás
    
    const years = [];
    for (let year = endYear; year >= startYear; year--) {
      years.push(year.toString());
    }
    return years;
  };

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

  const handleFetchHistory = async () => {
    if (!selectedYear || !selectedMonth || !user) {
      toast({
        title: "Erro",
        description: "Por favor, selecione o ano e mês para consultar.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-archived-data', {
        body: {
          year: parseInt(selectedYear),
          month: parseInt(selectedMonth),
        },
      });

      if (error) throw error;

      if (data?.success && data?.found) {
        setArchivedData(data.data || []);
        toast({
          title: "Sucesso",
          description: `Encontrados ${data.data?.length || 0} registros arquivados.`,
        });
      } else {
        setArchivedData([]);
        toast({
          title: "Informação",
          description: "Nenhum registro encontrado para este período.",
        });
      }
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      toast({
        title: "Erro",
        description: "Erro ao buscar dados arquivados. Tente novamente.",
        variant: "destructive",
      });
      setArchivedData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      realizada: { label: "Realizada", variant: "default" as const },
      cancelada: { label: "Cancelada", variant: "destructive" as const },
      pendente: { label: "Pendente", variant: "secondary" as const },
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { label: status, variant: "outline" as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Archive className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Histórico de Aulas Arquivadas</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Consultar Histórico</CardTitle>
            <CardDescription>
              Consulte suas aulas e relatórios arquivados por período. 
              Dados mais antigos que 18 meses são movidos para o arquivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ano</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {generateAvailableYears().map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mês</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">&nbsp;</label>
                <Button 
                  onClick={handleFetchHistory} 
                  disabled={isLoading || !selectedYear || !selectedMonth}
                  className="w-full"
                >
                  {isLoading ? "Buscando..." : "Buscar Histórico"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {isLoading && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && archivedData.length === 0 && selectedYear && selectedMonth && (
          <Card>
            <CardContent className="p-6 text-center">
              <Archive className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Nenhum registro encontrado</h3>
              <p className="text-muted-foreground">
                Não há dados arquivados para {months.find(m => m.value === selectedMonth)?.label} de {selectedYear}.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && archivedData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Aulas Arquivadas - {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
              </CardTitle>
              <CardDescription>
                {archivedData.length} registro(s) encontrado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead>Relatório</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedData.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell>
                        {formatDateTime(classItem.class_date)}
                      </TableCell>
                      <TableCell>
                        {classItem.duration_minutes} min
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(classItem.status)}
                      </TableCell>
                      <TableCell>
                        {classItem.notes || "-"}
                      </TableCell>
                      <TableCell>
                        {classItem.class_reports && classItem.class_reports.length > 0 ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setSelectedReport(classItem.class_reports![0])}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Ver Relatório
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Relatório da Aula</DialogTitle>
                                <DialogDescription>
                                  Aula do dia {formatDateTime(classItem.class_date)}
                                </DialogDescription>
                              </DialogHeader>
                              {selectedReport && (
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="font-medium mb-2">Resumo da Aula</h4>
                                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                                      {selectedReport.lesson_summary}
                                    </p>
                                  </div>
                                  
                                  {selectedReport.homework && (
                                    <div>
                                      <h4 className="font-medium mb-2">Lição de Casa</h4>
                                      <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                                        {selectedReport.homework}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {selectedReport.extra_materials && (
                                    <div>
                                      <h4 className="font-medium mb-2">Materiais Extras</h4>
                                      <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                                        {selectedReport.extra_materials}
                                      </p>
                                    </div>
                                  )}
                                  
                                  <div className="text-xs text-muted-foreground pt-2 border-t">
                                    Relatório criado em: {formatDateTime(selectedReport.created_at)}
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-muted-foreground text-sm">Sem relatório</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
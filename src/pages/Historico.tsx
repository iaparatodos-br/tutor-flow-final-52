import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Archive, Calendar, FileText, User, Baby } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
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
  is_group_class?: boolean;
  class_reports?: ArchivedClassReport[];
  participants?: Array<{
    student_id: string;
    dependent_id?: string | null;
    status: string;
    cancelled_at?: string;
    charge_applied?: boolean;
    cancellation_reason?: string;
    student: {
      name: string;
      email: string;
    };
  }>;
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

interface Dependent {
  id: string;
  name: string;
  birth_date: string | null;
}

export default function Historico() {
  const { user } = useAuth();
  const { profile, isAluno } = useProfile();
  const { selectedTeacherId } = useTeacherContext();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [archivedData, setArchivedData] = useState<ArchivedClass[]>([]);
  const [selectedReport, setSelectedReport] = useState<ArchivedClassReport | null>(null);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [activeTab, setActiveTab] = useState<string>("self");

  // Load dependents for students
  useEffect(() => {
    if (isAluno && profile?.id && selectedTeacherId) {
      loadDependents();
    }
  }, [isAluno, profile?.id, selectedTeacherId]);

  const loadDependents = async () => {
    if (!profile?.id || !selectedTeacherId) return;

    try {
      const { data, error } = await supabase
        .from('dependents')
        .select('id, name, birth_date')
        .eq('responsible_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .order('name');

      if (error) {
        console.error('Error loading dependents:', error);
        return;
      }

      setDependents(data || []);
    } catch (error) {
      console.error('Error loading dependents:', error);
    }
  };

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
      realizada: { label: "Realizada", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent" },
      cancelada: { label: "Cancelada", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-transparent" },
      pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent" },
      aguardando_pagamento: { label: "Aguardando Pagamento", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-transparent" },
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { label: status, className: "" };
    return <Badge variant="secondary" className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  // Filter archived data based on active tab (for students with dependents)
  const getFilteredArchivedData = () => {
    if (!isAluno || dependents.length === 0) {
      return archivedData;
    }

    return archivedData.filter(classItem => {
      // Check if any participant matches the filter
      if (!classItem.participants || classItem.participants.length === 0) {
        // Fallback for legacy data - show in "self" tab
        return activeTab === "self";
      }

      if (activeTab === "self") {
        // Show classes where the user is a direct participant (no dependent_id)
        return classItem.participants.some(p => 
          p.student_id === profile?.id && !p.dependent_id
        );
      } else {
        // Show classes where the specific dependent is a participant
        return classItem.participants.some(p => p.dependent_id === activeTab);
      }
    });
  };

  const filteredArchivedData = getFilteredArchivedData();

  const getSelfClassesCount = () => {
    if (!isAluno) return archivedData.length;
    return archivedData.filter(c => 
      c.participants?.some(p => p.student_id === profile?.id && !p.dependent_id) ||
      (!c.participants || c.participants.length === 0)
    ).length;
  };

  const getDependentClassesCount = (dependentId: string) => {
    return archivedData.filter(c => 
      c.participants?.some(p => p.dependent_id === dependentId)
    ).length;
  };

  const renderArchivedTable = () => {
    if (filteredArchivedData.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center">
            <Archive className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">Nenhum registro encontrado</h3>
            <p className="text-muted-foreground">
              {activeTab === "self" 
                ? "Não há aulas arquivadas para você neste período."
                : `Não há aulas arquivadas para este dependente neste período.`
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
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
          {filteredArchivedData.map((classItem) => (
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
    );
  };

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
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
                {isAluno && dependents.length > 0 && (
                  <span className="ml-2">
                    <Badge variant="outline" className="ml-1">
                      <Baby className="h-3 w-3 mr-1" />
                      {dependents.length} dependente{dependents.length !== 1 ? 's' : ''}
                    </Badge>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAluno && dependents.length > 0 ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 mb-4">
                    <TabsTrigger value="self" className="flex items-center gap-2 flex-1 min-w-[120px]">
                      <User className="h-4 w-4" />
                      <span>Minhas Aulas</span>
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {getSelfClassesCount()}
                      </Badge>
                    </TabsTrigger>
                    {dependents.map(dep => (
                      <TabsTrigger
                        key={dep.id}
                        value={dep.id}
                        className="flex items-center gap-2 flex-1 min-w-[120px]"
                      >
                        <Baby className="h-4 w-4" />
                        <span className="truncate max-w-[100px]">{dep.name}</span>
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {getDependentClassesCount(dep.id)}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="self" className="mt-0">
                    {renderArchivedTable()}
                  </TabsContent>

                  {dependents.map(dep => (
                    <TabsContent key={dep.id} value={dep.id} className="mt-0">
                      <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center gap-2">
                        <Baby className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Aulas arquivadas de <strong>{dep.name}</strong>
                        </span>
                      </div>
                      {renderArchivedTable()}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                renderArchivedTable()
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
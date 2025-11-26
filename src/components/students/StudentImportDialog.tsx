import { useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Check, AlertTriangle, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import * as XLSX from 'xlsx';

interface StudentImportDialogProps {
  onSuccess: () => void;
  currentStudentCount: number;
}

type SystemField = 'name' | 'email' | 'phone' | 'guardian_name' | 'guardian_email' | 'guardian_phone' | 'cpf' | 'billing_day' | 'guardian_address_street' | 'guardian_address_city' | 'guardian_address_state' | 'guardian_address_postal_code';

const SYSTEM_FIELDS: { key: SystemField; label: string; required: boolean }[] = [
  { key: 'name', label: 'Nome do Aluno', required: true },
  { key: 'email', label: 'E-mail do Aluno', required: true },
  { key: 'phone', label: 'Telefone/Celular', required: false },
  { key: 'billing_day', label: 'Dia de Cobrança', required: false },
  { key: 'guardian_name', label: 'Nome do Responsável', required: false },
  { key: 'guardian_email', label: 'E-mail do Responsável', required: false },
  { key: 'guardian_phone', label: 'Telefone do Responsável', required: false },
  { key: 'cpf', label: 'CPF do Responsável', required: false },
  { key: 'guardian_address_street', label: 'Endereço (Rua, Nº)', required: false },
  { key: 'guardian_address_city', label: 'Cidade', required: false },
  { key: 'guardian_address_state', label: 'Estado (UF)', required: false },
  { key: 'guardian_address_postal_code', label: 'CEP', required: false },
];

export function StudentImportDialog({ onSuccess, currentStudentCount }: StudentImportDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { getStudentOverageInfo, currentPlan } = useSubscription();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<SystemField, string>>({} as any);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [overageConfirmed, setOverageConfirmed] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length === 0) {
          toast({
            title: "Arquivo vazio",
            description: "O arquivo selecionado não contém dados.",
            variant: "destructive"
          });
          return;
        }

        const fileHeaders = data[0] as string[];
        const rows = XLSX.utils.sheet_to_json(ws);

        setHeaders(fileHeaders);
        setRawData(rows);
        guessMapping(fileHeaders);
        setStep(2);
        setOverageConfirmed(false); // Reset confirmation
      } catch (error) {
        console.error("Error parsing file:", error);
        toast({
          title: "Erro ao ler arquivo",
          description: "Verifique se o arquivo é um Excel ou CSV válido.",
          variant: "destructive"
        });
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const guessMapping = (fileHeaders: string[]) => {
    const newMapping: Record<string, string> = {};

    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const rules: Record<SystemField, string[]> = {
      name: ['nome', 'aluno', 'estudante', 'name', 'student', 'completo'],
      email: ['email', 'e-mail', 'correio', 'mail'],
      phone: ['telefone', 'celular', 'whatsapp', 'phone', 'mobile', 'tel'],
      billing_day: ['dia', 'vencimento', 'cobranca', 'pagamento', 'billing', 'day'],
      guardian_name: ['responsavel', 'pai', 'mae', 'guardian', 'parent'],
      guardian_email: ['emailresponsavel', 'emailpai', 'emailmae'],
      guardian_phone: ['telefoneresponsavel', 'celularresponsavel', 'telresponsavel'],
      cpf: ['cpf', 'documento'],
      guardian_address_street: ['endereco', 'rua', 'logradouro', 'address', 'street'],
      guardian_address_city: ['cidade', 'municipio', 'city'],
      guardian_address_state: ['estado', 'uf', 'state'],
      guardian_address_postal_code: ['cep', 'postal', 'zip']
    };

    // First pass: exact matches or strong contains
    SYSTEM_FIELDS.forEach(field => {
      const possibleHeaders = rules[field.key];
      const match = fileHeaders.find(h => {
        const normalizedHeader = normalize(h);
        return possibleHeaders.some(ph => normalizedHeader.includes(ph));
      });

      if (match) {
        newMapping[field.key] = match;
      }
    });

    setMapping(newMapping as any);
  };

  const handleMappingChange = (systemField: SystemField, fileHeader: string) => {
    setMapping(prev => ({ ...prev, [systemField]: fileHeader }));
  };

  const getPreviewData = () => {
    return rawData.slice(0, 5).map(row => {
      const mappedRow: any = {};
      SYSTEM_FIELDS.forEach(field => {
        const header = mapping[field.key];
        if (header) {
          mappedRow[field.key] = row[header];
        }
      });
      return mappedRow;
    });
  };

  const handleImport = async () => {
    if (!profile?.id) return;

    // Check limits
    const totalNewStudents = rawData.length;
    const projectedTotal = currentStudentCount + totalNewStudents;
    const overageInfo = getStudentOverageInfo(projectedTotal);

    if (overageInfo.isOverLimit) {
      if (currentPlan?.slug === 'free') {
        toast({
          title: "Limite do Plano Gratuito Excedido",
          description: `Você pode ter no máximo 3 alunos no plano gratuito. Esta importação resultaria em ${projectedTotal} alunos.`,
          variant: "destructive"
        });
        return;
      }

      if (!overageConfirmed) {
        // This should be handled by UI state to show confirmation dialog, 
        // but for now we'll use a simple confirm (or better, add a step 4 or modal)
        // Since we are inside the function, let's use a state to show a warning in the UI instead of blocking here if we want a custom UI.
        // However, to keep it simple within the dialog flow:
        // We will block here and require a specific "Confirmar Custos" button in the UI if overage is detected.
        return;
      }
    }

    setImporting(true);
    setProgress({ current: 0, total: rawData.length, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        // Extract data using mapping
        const name = row[mapping.name];
        const email = row[mapping.email];
        const phone = mapping.phone ? row[mapping.phone] : undefined;

        // Guardian logic: if guardian_name is missing, use student data (self-responsible)
        const mappedGuardianName = mapping.guardian_name ? row[mapping.guardian_name] : undefined;
        const isOwnResponsible = !mappedGuardianName;

        const guardian_name = isOwnResponsible ? name : mappedGuardianName;
        const guardian_email = isOwnResponsible ? email : (mapping.guardian_email ? row[mapping.guardian_email] : undefined);
        const guardian_phone = isOwnResponsible ? phone : (mapping.guardian_phone ? row[mapping.guardian_phone] : undefined);

        // Billing day logic
        let billing_day = 15; // Default
        if (mapping.billing_day && row[mapping.billing_day]) {
          const parsedDay = parseInt(row[mapping.billing_day]);
          if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
            billing_day = parsedDay;
          }
        }

        const studentData = {
          name,
          email,
          phone,
          guardian_name,
          guardian_email,
          guardian_phone,
          guardian_cpf: mapping.cpf ? row[mapping.cpf] : undefined,
          guardian_address_street: mapping.guardian_address_street ? row[mapping.guardian_address_street] : undefined,
          guardian_address_city: mapping.guardian_address_city ? row[mapping.guardian_address_city] : undefined,
          guardian_address_state: mapping.guardian_address_state ? row[mapping.guardian_address_state] : undefined,
          guardian_address_postal_code: mapping.guardian_address_postal_code ? row[mapping.guardian_address_postal_code] : undefined,

          // Default values
          teacher_id: profile.id,
          redirect_url: window.location.hostname === 'localhost' ? undefined : `${window.location.origin}/auth/callback`,
          notify_professor_email: profile.email,
          professor_name: profile.name,
          billing_day
        };

        // Basic validation
        if (!studentData.name || !studentData.email) {
          console.warn(`Skipping row ${i}: Missing name or email`);
          failCount++;
          continue;
        }

        // Call Supabase function
        const { data, error } = await supabase.functions.invoke('create-student', {
          body: studentData
        });

        if (error || (data && !data.success)) {
          console.error(`Error importing row ${i}:`, error || data?.error);
          failCount++;
        } else {
          successCount++;
        }

      } catch (err) {
        console.error(`Exception importing row ${i}:`, err);
        failCount++;
      }
    }

    setImporting(false);
    setProgress(prev => ({ ...prev, success: successCount, failed: failCount }));

    toast({
      title: "Importação concluída",
      description: `${successCount} alunos importados com sucesso. ${failCount} falhas.`,
      variant: successCount > 0 ? "default" : "destructive"
    });

    if (successCount > 0) {
      onSuccess();
      setTimeout(() => {
        setOpen(false);
        setStep(1);
        setFile(null);
        setOverageConfirmed(false);
      }, 2000);
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRawData([]);
    setMapping({} as any);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!importing) {
        setOpen(val);
        if (!val) reset();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Importar Alunos em Massa</DialogTitle>
          <DialogDescription>
            Adicione vários alunos de uma vez enviando uma planilha Excel ou CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 bg-muted/30 hover:bg-muted/50 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Arraste seu arquivo aqui</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
                Suporta arquivos .xlsx, .xls e .csv. Certifique-se de que a primeira linha contém os cabeçalhos.
              </p>
              <Input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                id="file-upload"
                onChange={handleFileChange}
              />
              <Button asChild>
                <label htmlFor="file-upload" className="cursor-pointer">
                  Selecionar Arquivo
                </label>
              </Button>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-md flex items-start gap-3 text-sm text-blue-800 dark:text-blue-200">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>
                  Identificamos as colunas abaixo. Por favor, confirme se o mapeamento está correto para garantir que os dados sejam importados para os campos certos.
                </p>
              </div>

              <div className="grid gap-4 py-2 max-h-[400px] overflow-y-auto pr-2">
                {SYSTEM_FIELDS.map((field) => (
                  <div key={field.key} className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-5">
                      <Label className="text-base">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="col-span-6">
                      <Select
                        value={mapping[field.key] || "ignore"}
                        onValueChange={(val) => handleMappingChange(field.key, val === "ignore" ? "" : val)}
                      >
                        <SelectTrigger className={!mapping[field.key] && field.required ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione a coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore" className="text-muted-foreground italic">
                            -- Ignorar / Não importar --
                          </SelectItem>
                          {headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preview & Import */}
          {step === 3 && (
            <div className="space-y-4">
              {importing ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <div className="text-center">
                    <h3 className="text-lg font-medium">Importando alunos...</h3>
                    <p className="text-muted-foreground">
                      Processando {progress.current} de {progress.total}
                    </p>
                  </div>
                  <div className="w-full max-w-md bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-medium mb-2">Pré-visualização (5 primeiros registros)</h3>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>E-mail</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Responsável</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getPreviewData().map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.name || <span className="text-destructive italic">Ausente</span>}</TableCell>
                            <TableCell>{row.email || <span className="text-destructive italic">Ausente</span>}</TableCell>
                            <TableCell>{row.phone || "-"}</TableCell>
                            <TableCell>{row.guardian_name || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Total de registros a importar: <strong>{rawData.length}</strong>
                  </p>

                  {(!mapping.name || !mapping.email) && (
                    <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2 mt-4">
                      <AlertTriangle className="h-4 w-4" />
                      É obrigatório mapear as colunas de Nome e E-mail.
                    </div>
                  )}

                  {/* Limit Warning */}
                  {(() => {
                    const totalNewStudents = rawData.length;
                    const projectedTotal = currentStudentCount + totalNewStudents;
                    const overageInfo = getStudentOverageInfo(projectedTotal);

                    if (overageInfo.isOverLimit) {
                      if (currentPlan?.slug === 'free') {
                        return (
                          <div className="bg-destructive/10 text-destructive p-4 rounded-md text-sm flex items-start gap-3 mt-4 border border-destructive/20">
                            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold mb-1">Limite do Plano Gratuito Excedido</p>
                              <p>
                                O plano gratuito permite apenas 3 alunos. Você já tem {currentStudentCount} e está tentando importar mais {totalNewStudents}, totalizando {projectedTotal}.
                              </p>
                              <p className="mt-2 font-medium">
                                Faça upgrade do seu plano para importar estes alunos.
                              </p>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-4 rounded-md text-sm flex items-start gap-3 mt-4 border border-amber-200 dark:border-amber-800">
                            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold mb-1">Custo Adicional Detectado</p>
                              <p>
                                Esta importação excederá o limite do seu plano ({currentPlan?.student_limit} alunos).
                              </p>
                              <p className="mt-1">
                                {overageInfo.message}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="confirm-overage"
                                  checked={overageConfirmed}
                                  onChange={(e) => setOverageConfirmed(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <label htmlFor="confirm-overage" className="font-medium cursor-pointer">
                                  Estou ciente e concordo com os custos adicionais
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {step > 1 && !importing && (
            <Button variant="ghost" onClick={() => setStep(step - 1 as any)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            {step === 1 && (
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            )}
            {step === 2 && (
              <Button onClick={() => setStep(3)} disabled={!mapping.name || !mapping.email}>
                Próximo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {step === 3 && !importing && (
              <Button
                onClick={handleImport}
                disabled={
                  !mapping.name ||
                  !mapping.email ||
                  (getStudentOverageInfo(currentStudentCount + rawData.length).isOverLimit && currentPlan?.slug === 'free') ||
                  (getStudentOverageInfo(currentStudentCount + rawData.length).isOverLimit && currentPlan?.slug !== 'free' && !overageConfirmed)
                }
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar Importação
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

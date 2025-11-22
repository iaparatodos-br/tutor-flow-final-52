import { useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
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
}

type SystemField = 'name' | 'email' | 'phone' | 'guardian_name' | 'guardian_email' | 'guardian_phone' | 'cpf';

const SYSTEM_FIELDS: { key: SystemField; label: string; required: boolean }[] = [
  { key: 'name', label: 'Nome do Aluno', required: true },
  { key: 'email', label: 'E-mail do Aluno', required: true },
  { key: 'phone', label: 'Telefone/Celular', required: false },
  { key: 'guardian_name', label: 'Nome do Responsável', required: false },
  { key: 'guardian_email', label: 'E-mail do Responsável', required: false },
  { key: 'guardian_phone', label: 'Telefone do Responsável', required: false },
  { key: 'cpf', label: 'CPF do Responsável', required: false },
];

export function StudentImportDialog({ onSuccess }: StudentImportDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<SystemField, string>>({} as any);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

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
      guardian_name: ['responsavel', 'pai', 'mae', 'guardian', 'parent'],
      guardian_email: ['emailresponsavel', 'emailpai', 'emailmae'],
      guardian_phone: ['telefoneresponsavel', 'celularresponsavel', 'telresponsavel'],
      cpf: ['cpf', 'documento']
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
    
    setImporting(true);
    setProgress({ current: 0, total: rawData.length, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        // Extract data using mapping
        const studentData = {
          name: row[mapping.name],
          email: row[mapping.email],
          phone: mapping.phone ? row[mapping.phone] : undefined,
          guardian_name: mapping.guardian_name ? row[mapping.guardian_name] : undefined,
          guardian_email: mapping.guardian_email ? row[mapping.guardian_email] : undefined,
          guardian_phone: mapping.guardian_phone ? row[mapping.guardian_phone] : undefined,
          guardian_cpf: mapping.cpf ? row[mapping.cpf] : undefined,
          
          // Default values
          teacher_id: profile.id,
          redirect_url: window.location.hostname === 'localhost' ? undefined : `${window.location.origin}/auth/callback`,
          notify_professor_email: profile.email,
          professor_name: profile.name,
          billing_day: 15 // Default billing day
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
              <Button onClick={handleImport} disabled={!mapping.name || !mapping.email}>
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

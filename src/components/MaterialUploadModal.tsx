import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { toast } from "sonner";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { validateFileUpload, sanitizeInput } from "@/utils/validation";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface MaterialUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMaterialUploaded: () => void;
  categories: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm'
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Storage info component
function StorageInfo() {
  const { profile } = useProfile();
  const { currentPlan } = useSubscription();
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    limit: number;
    loading: boolean;
  }>({ used: 0, limit: 150, loading: true });

  useEffect(() => {
    const loadStorageInfo = async () => {
      if (!profile) return;

      try {
        const { data: materials, error } = await supabase
          .from('materials')
          .select('file_size')
          .eq('teacher_id', profile.id);

        if (error) throw error;

        const usedBytes = materials?.reduce((total, material) => total + material.file_size, 0) || 0;
        const usedMB = Math.round(usedBytes / (1024 * 1024));
        const limitMB = currentPlan?.features.storage_mb || 150;

        setStorageInfo({ used: usedMB, limit: limitMB, loading: false });
      } catch (error) {
        console.error('Error loading storage info:', error);
        setStorageInfo(prev => ({ ...prev, loading: false }));
      }
    };

    loadStorageInfo();
  }, [profile, currentPlan]);

  if (storageInfo.loading) {
    return <p className="text-xs text-muted-foreground">Carregando...</p>;
  }

  const percentageUsed = (storageInfo.used / storageInfo.limit) * 100;
  const isNearLimit = percentageUsed > 80;

  return (
    <div className="text-xs space-y-1">
      <p className={`${isNearLimit ? 'text-orange-600' : 'text-muted-foreground'}`}>
        Armazenamento: {storageInfo.used}MB / {storageInfo.limit}MB ({Math.round(percentageUsed)}%)
      </p>
      <div className="w-full bg-secondary rounded-full h-1">
        <div 
          className={`h-1 rounded-full transition-all ${
            percentageUsed > 90 ? 'bg-destructive' : 
            percentageUsed > 80 ? 'bg-orange-500' : 'bg-primary'
          }`}
          style={{ width: `${Math.min(percentageUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function MaterialUploadModal({ 
  isOpen, 
  onClose, 
  onMaterialUploaded, 
  categories 
}: MaterialUploadModalProps) {
  const { profile } = useProfile();
  const { currentPlan } = useSubscription();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategoryId("");
    setFile(null);
    setUploadProgress(0);
  };

  const handleClose = () => {
    if (!uploading) {
      resetForm();
      onClose();
    }
  };

  const validateFile = async (file: File): Promise<{ valid: boolean; errors: string[] }> => {
    const baseValidation = validateFileUpload(file);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Check if adding this file would exceed storage limit
    const storageValidation = await checkStorageLimit(file.size, currentPlan);
    if (!storageValidation.valid) {
      return storageValidation;
    }
    
    return { valid: true, errors: [] };
  };

  const checkStorageLimit = async (newFileSize: number, plan: any): Promise<{ valid: boolean; errors: string[] }> => {
    if (!profile) return { valid: false, errors: ['Perfil não encontrado'] };

    try {
      // Get current storage usage
      const { data: materials, error } = await supabase
        .from('materials')
        .select('file_size')
        .eq('teacher_id', profile.id);

      if (error) throw error;

      const currentUsageMB = materials?.reduce((total, material) => total + material.file_size, 0) || 0;
      const currentUsageInMB = currentUsageMB / (1024 * 1024);
      const newFileInMB = newFileSize / (1024 * 1024);
      const totalUsageInMB = currentUsageInMB + newFileInMB;

      // Get storage limit from current plan
      const storageLimitMB = plan?.features.storage_mb || 150; // Default to free plan limit

      if (totalUsageInMB > storageLimitMB) {
        const overageMB = Math.ceil(totalUsageInMB - storageLimitMB);
        return {
          valid: false,
          errors: [
            `Limite de armazenamento excedido! Você tem ${Math.round(currentUsageInMB)}MB usados de ${storageLimitMB}MB disponíveis. ` +
            `Este arquivo (${Math.round(newFileInMB)}MB) excederia seu limite em ${overageMB}MB. ` +
            `Faça upgrade do seu plano ou remova alguns arquivos antes de continuar.`
          ]
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      console.error('Error checking storage limit:', error);
      return { valid: false, errors: ['Erro ao verificar limite de armazenamento'] };
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    const validation = await validateFile(selectedFile);
    if (!validation.valid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile || !file || !title.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setUploading(true);
    
    try {
      // Create unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${profile.id}/${fileName}`;

      // Upload file to Supabase Storage with progress simulation
      setUploadProgress(10);
      const { error: uploadError } = await supabase.storage
        .from('teaching-materials')
        .upload(filePath, file);
      
      setUploadProgress(80);

      if (uploadError) throw uploadError;

      // Insert material record
      const { error: dbError } = await supabase
        .from('materials')
        .insert({
          title: sanitizeInput(title.trim()),
          description: description.trim() ? sanitizeInput(description.trim()) : null,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          teacher_id: profile.id,
          category_id: categoryId || null
        });

      if (dbError) throw dbError;

      toast.success("Material enviado com sucesso!");
      onMaterialUploaded();
      handleClose();

    } catch (error) {
      console.error('Error uploading material:', error);
      toast.error("Erro ao enviar material");
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Material</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do material"
              required
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o conteúdo do material (opcional)"
              rows={3}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={uploading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Arquivo *</Label>
            <div
              className={`
                border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}
                ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.gif,.txt,.mp3,.wav,.ogg,.m4a"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFileSelect(file);
                }}
                disabled={uploading}
              />
              
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-8 w-8 mx-auto text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  {!uploading && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                      Remover
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                   <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <div>
                      <p className="font-medium">Clique ou arraste um arquivo</p>
                      <p className="text-sm text-muted-foreground">
                        PDF, DOCX, PPTX, JPG, PNG, GIF, TXT, MP3, WAV, OGG, M4A
                      </p>
                      <StorageInfo />
                    </div>
                </div>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>O material será salvo como rascunho. Compartilhe com os alunos depois.</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!file || !title.trim() || uploading}
            >
              {uploading ? "Enviando..." : "Enviar Material"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
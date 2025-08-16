import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, X, File } from "lucide-react";

interface MaterialCategory {
  id: string;
  name: string;
  color: string;
}

interface MaterialUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MaterialCategory[];
  onSuccess: () => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
}

export function MaterialUploadModal({
  open,
  onOpenChange,
  categories,
  onSuccess
}: MaterialUploadModalProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.ms-powerpoint'
  ];

  const maxFileSize = 25 * 1024 * 1024; // 25MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    const validFiles = files.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Tipo de arquivo não permitido: ${file.name}`);
        return false;
      }
      if (file.size > maxFileSize) {
        toast.error(`Arquivo muito grande: ${file.name} (máximo 25MB)`);
        return false;
      }
      return true;
    });

    setUploadingFiles(validFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const
    })));

    // Set title from first file if empty
    if (!title && validFiles.length > 0) {
      setTitle(validFiles[0].name.split('.')[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    if (fileInputRef.current) {
      fileInputRef.current.files = e.dataTransfer.files;
      handleFileSelect({ target: fileInputRef.current } as any);
    }
  };

  const removeFile = (index: number) => {
    setUploadingFiles(files => files.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!profile || uploadingFiles.length === 0 || !title.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setIsUploading(true);

    try {
      for (let i = 0; i < uploadingFiles.length; i++) {
        const fileData = uploadingFiles[i];
        const { file } = fileData;

        // Generate unique file path
        const fileExtension = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const filePath = `${profile.id}/${categoryId || 'uncategorized'}/${fileName}`;

        // Update progress to show upload starting
        setUploadingFiles(files => 
          files.map((f, index) => 
            index === i ? { ...f, progress: 5 } : f
          )
        );

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('teaching-materials')
          .upload(filePath, file);

        // Simulate progress for better UX
        setUploadingFiles(files => 
          files.map((f, index) => 
            index === i ? { ...f, progress: 90 } : f
          )
        );

        if (uploadError) throw uploadError;

        // Save to database
        const { error: dbError } = await supabase
          .from('materials')
          .insert({
            teacher_id: profile.id,
            category_id: categoryId || null,
            title: uploadingFiles.length === 1 ? title : `${title} - ${file.name}`,
            description,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type
          });

        if (dbError) throw dbError;

        // Mark as complete
        setUploadingFiles(files => 
          files.map((f, index) => 
            index === i ? { ...f, progress: 100, status: 'complete' } : f
          )
        );
      }

      toast.success("Material(is) enviado(s) com sucesso!");
      onSuccess();
      handleClose();
      
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error("Erro ao enviar material(is)");
      setUploadingFiles(files => 
        files.map(f => ({ ...f, status: 'error' }))
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setTitle("");
      setDescription("");
      setCategoryId("");
      setUploadingFiles([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Material</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do material"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional do material"
              rows={3}
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={isUploading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span>{category.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Arquivos</Label>
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.gif,.txt,.doc,.ppt"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              
              {uploadingFiles.length === 0 ? (
                <div>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Arraste arquivos aqui ou clique para selecionar
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    Selecionar Arquivos
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    PDF, DOCX, PPTX, JPG, PNG, GIF, TXT (máx. 25MB)
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadingFiles.map((fileData, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 bg-muted rounded-lg">
                      <File className="h-4 w-4" />
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium">{fileData.file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                        {fileData.status === 'uploading' && (
                          <Progress value={fileData.progress} className="mt-1 h-1" />
                        )}
                      </div>
                      {fileData.status === 'complete' && (
                        <div className="text-green-600 text-xs">✓ Completo</div>
                      )}
                      {fileData.status === 'error' && (
                        <div className="text-red-600 text-xs">✗ Erro</div>
                      )}
                      {!isUploading && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancelar
            </Button>
            <Button 
              onClick={uploadFiles} 
              disabled={!title.trim() || uploadingFiles.length === 0 || isUploading}
            >
              {isUploading ? "Enviando..." : "Enviar Material"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
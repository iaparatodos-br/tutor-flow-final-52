import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Camera, X, Upload, ImagePlus, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { cn } from '@/lib/utils';

interface PhotoFile {
  id: string;
  file?: File;
  preview: string;
  isExisting: boolean;
  filePath?: string;
  fileName?: string;
}

interface ClassReportPhotoUploadProps {
  photos: PhotoFile[];
  onPhotosChange: (photos: PhotoFile[]) => void;
  maxPhotos?: number;
  maxSizeMB?: number;
}

const MAX_PHOTOS = 5;
const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ClassReportPhotoUpload({
  photos,
  onPhotosChange,
  maxPhotos = MAX_PHOTOS,
  maxSizeMB = MAX_SIZE_MB
}: ClassReportPhotoUploadProps) {
  const { t } = useTranslation('reports');
  const { toast } = useToast();
  const { currentPlan } = useSubscription();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Check if user has access (professional or premium plan)
  const hasPhotoAccess = currentPlan?.slug === 'professional' || currentPlan?.slug === 'premium';

  const processFiles = async (fileList: FileList) => {
    const remainingSlots = maxPhotos - photos.length;
    if (remainingSlots <= 0) {
      toast({
        title: t('modal.fields.photos.maxReached'),
        variant: "destructive",
      });
      return;
    }

    const filesToProcess = Array.from(fileList).slice(0, remainingSlots);
    const validFiles: File[] = [];

    filesToProcess.forEach(file => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({
          title: t('modal.fields.photos.invalidType'),
          variant: "destructive",
        });
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast({
          title: t('modal.fields.photos.tooLarge'),
          variant: "destructive",
        });
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length === 0) return;

    const readFile = (file: File): Promise<PhotoFile> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            preview: e.target?.result as string,
            isExisting: false,
            fileName: file.name
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    const newPhotos = await Promise.all(validFiles.map(readFile));
    if (newPhotos.length > 0) {
      onPhotosChange([...photos, ...newPhotos]);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    await processFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const removePhoto = (photoId: string) => {
    onPhotosChange(photos.filter(p => p.id !== photoId));
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Don't show anything if user doesn't have access
  if (!hasPhotoAccess) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Camera className="h-4 w-4" />
        {t('modal.fields.photos.label')}
      </Label>
      <p className="text-sm text-muted-foreground">
        {t('modal.fields.photos.description')}
      </p>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div 
              key={photo.id} 
              className="relative aspect-square rounded-lg overflow-hidden border bg-muted group w-24 h-24"
            >
              <img
                src={photo.preview}
                alt={photo.fileName || 'Foto'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('modal.fields.photos.removePhoto')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {photos.length < maxPhotos && (
        <div
          onClick={openFilePicker}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('modal.fields.photos.dropzone')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {photos.length}/{maxPhotos}
          </p>
        </div>
      )}

      {/* Max reached message */}
      {photos.length >= maxPhotos && (
        <p className="text-sm text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          {t('modal.fields.photos.maxReached')}
        </p>
      )}
    </div>
  );
}

// Helper function to upload photos to Supabase Storage
export async function uploadReportPhotos(
  photos: PhotoFile[],
  teacherId: string,
  classId: string,
  reportId: string
): Promise<{ uploaded: string[], errors: string[] }> {
  const uploaded: string[] = [];
  const errors: string[] = [];

  const newPhotos = photos.filter(p => !p.isExisting && p.file);

  for (const photo of newPhotos) {
    if (!photo.file) continue;

    const fileExt = photo.file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${teacherId}/${classId}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('class-report-photos')
        .upload(filePath, photo.file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Save to database
      const { error: dbError } = await supabase
        .from('class_report_photos')
        .insert({
          report_id: reportId,
          file_path: filePath,
          file_name: photo.file.name,
          file_size: photo.file.size
        });

      if (dbError) throw dbError;

      uploaded.push(filePath);
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      errors.push(photo.file.name);
    }
  }

  return { uploaded, errors };
}

// Helper function to delete photos from storage and database
export async function deleteReportPhotos(
  photosToDelete: PhotoFile[]
): Promise<void> {
  const existingPhotos = photosToDelete.filter(p => p.isExisting && p.filePath);

  for (const photo of existingPhotos) {
    if (!photo.filePath) continue;

    try {
      // Delete from storage
      await supabase.storage
        .from('class-report-photos')
        .remove([photo.filePath]);

      // Database entry will be deleted by cascade when report is deleted,
      // or we can delete it explicitly if needed
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  }
}

// Helper to load existing photos for a report
export async function loadReportPhotos(reportId: string): Promise<PhotoFile[]> {
  const { data, error } = await supabase
    .from('class_report_photos')
    .select('*')
    .eq('report_id', reportId);

  if (error) {
    console.error('Error loading photos:', error);
    return [];
  }

  return (data || []).map(photo => {
    const { data: urlData } = supabase.storage
      .from('class-report-photos')
      .getPublicUrl(photo.file_path);

    return {
      id: photo.id,
      preview: urlData.publicUrl,
      isExisting: true,
      filePath: photo.file_path,
      fileName: photo.file_name
    };
  });
}

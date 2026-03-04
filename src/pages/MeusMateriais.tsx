import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { toast } from "sonner";
import { formatDateBrazil } from "@/utils/timezone";
import { Search, FileText, Download, Calendar, User, Baby } from "lucide-react";
import { useCapacitor } from "@/hooks/useCapacitor";

interface MaterialCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
  category_id: string | null;
  category?: MaterialCategory;
}

interface MaterialAccess {
  id: string;
  material_id: string;
  granted_at: string;
  dependent_id: string | null;
  material: Material;
}

interface Dependent {
  id: string;
  name: string;
  birth_date: string | null;
}

export default function MeusMateriais() {
  const { profile } = useProfile();
  const { selectedTeacherId } = useTeacherContext();
  const [materialAccess, setMaterialAccess] = useState<MaterialAccess[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("self");
  const { isNativeApp } = useCapacitor();

  useEffect(() => {
    if (profile?.role === 'aluno') {
      loadMaterials();
      loadDependents();
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role === 'aluno' && selectedTeacherId) {
      loadMaterials();
      loadDependents();
    }
  }, [selectedTeacherId]);

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

  const loadMaterials = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase.from('material_access').select(`
          *,
          material:materials(
            *,
            category:material_categories(*),
            teacher_id
          )
        `).eq('student_id', profile.id);

      if (selectedTeacherId) {
        query = query.eq('material.teacher_id', selectedTeacherId);
      }

      const { data, error } = await query.order('granted_at', { ascending: false });

      if (error) throw error;
      setMaterialAccess(data || []);
    } catch (error) {
      console.error('Error loading materials:', error);
      toast.error("Erro ao carregar materiais");
    } finally {
      setLoading(false);
    }
  };

  const getFilteredMaterials = () => {
    return materialAccess.filter(access => {
      const material = access.material;
      if (!material) return false;

      if (activeTab === "self") {
        if (access.dependent_id !== null) return false;
      } else {
        if (access.dependent_id !== activeTab) return false;
      }

      return (
        material.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  };

  const filteredMaterials = getFilteredMaterials();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('video')) return '🎥';
    if (fileType.includes('audio')) return '🎵';
    return '📎';
  };

  const handleDownload = async (material: Material) => {
    try {
      // No app nativo, usar URL assinada para download
      if (isNativeApp) {
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from('teaching-materials')
          .createSignedUrl(material.file_path, 300);

        if (signedError) throw signedError;
        
        if (signedUrlData?.signedUrl) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ 
            url: signedUrlData.signedUrl,
            presentationStyle: 'popover'
          });
          toast.success("Abrindo download...");
          return;
        }
      }

      // Fallback: download tradicional (web)
      const { data, error } = await supabase.storage
        .from('teaching-materials')
        .download(material.file_path);
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = material.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Download concluído");
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error("Erro ao fazer download");
    }
  };

  const getSelfMaterialsCount = () => {
    return materialAccess.filter(a => a.material && a.dependent_id === null).length;
  };

  const getDependentMaterialsCount = (dependentId: string) => {
    return materialAccess.filter(a => a.material && a.dependent_id === dependentId).length;
  };

  if (profile?.role !== 'aluno') {
    return (
      <Layout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Esta página é exclusiva para alunos.</p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
            <p className="text-muted-foreground">Carregando materiais...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const renderMaterialsGrid = () => {
    if (filteredMaterials.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm ? "Nenhum material encontrado" : "Nenhum material disponível"}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Tente alterar os filtros de busca"
                : activeTab === "self"
                  ? "Seu professor ainda não compartilhou materiais com você"
                  : "Seu professor ainda não compartilhou materiais com este dependente"
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMaterials.map(access => {
          const material = access.material;
          return (
            <Card key={access.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{getFileIcon(material.file_type)}</span>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base line-clamp-2">
                        {material.title}
                      </CardTitle>
                      {material.category && (
                        <Badge
                          variant="secondary"
                          className="mt-1"
                          style={{
                            backgroundColor: `${material.category.color}20`,
                            color: material.category.color
                          }}
                        >
                          {material.category.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {material.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {material.description}
                  </p>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Tamanho: {formatFileSize(material.file_size)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Compartilhado: {formatDateBrazil(access.granted_at, undefined, profile?.timezone)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" className="flex-1" onClick={() => handleDownload(material)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Meus Materiais</h1>
          <p className="text-muted-foreground">
            Materiais compartilhados pelo seu professor
            {dependents.length > 0 && (
              <span className="ml-2">
                <Badge variant="outline" className="ml-1">
                  <Baby className="h-3 w-3 mr-1" />
                  {dependents.length} dependente{dependents.length !== 1 ? 's' : ''}
                </Badge>
              </span>
            )}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar materiais..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {dependents.length > 0 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
              <TabsTrigger value="self" className="flex items-center gap-2 flex-1 min-w-[120px]">
                <User className="h-4 w-4" />
                <span>Meus Materiais</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {getSelfMaterialsCount()}
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
                    {getDependentMaterialsCount(dep.id)}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="self" className="mt-4">
              {renderMaterialsGrid()}
            </TabsContent>

            {dependents.map(dep => (
              <TabsContent key={dep.id} value={dep.id} className="mt-4">
                <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center gap-2">
                  <Baby className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Materiais compartilhados com <strong>{dep.name}</strong>
                  </span>
                </div>
                {renderMaterialsGrid()}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          renderMaterialsGrid()
        )}

        {filteredMaterials.length > 0 && (
          <div className="text-center text-sm text-muted-foreground">
            {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 'ais' : ''} disponível{filteredMaterials.length !== 1 ? 'eis' : ''}
          </div>
        )}
      </div>
    </Layout>
  );
}

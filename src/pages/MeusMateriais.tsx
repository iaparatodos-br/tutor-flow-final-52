import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Search, FileText, Download, Calendar } from "lucide-react";

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
  material: Material;
}

export default function MeusMateriais() {
  const { profile } = useAuth();
  const [materialAccess, setMaterialAccess] = useState<MaterialAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role === 'aluno') {
      loadMaterials();
    }
  }, [profile]);

  const loadMaterials = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('material_access')
        .select(`
          *,
          material:materials(
            *,
            category:material_categories(*)
          )
        `)
        .eq('student_id', profile.id)
        .order('granted_at', { ascending: false });

      if (error) throw error;

      setMaterialAccess(data || []);
    } catch (error) {
      console.error('Error loading materials:', error);
      toast.error("Erro ao carregar materiais");
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materialAccess.filter(access => {
    const material = access.material;
    const matchesSearch = material.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || material.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(materialAccess
    .map(access => access.material.category)
    .filter(Boolean)
  )] as MaterialCategory[];

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
      const { data, error } = await supabase.storage
        .from('teaching-materials')
        .download(material.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = material.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado!");
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error("Erro ao baixar arquivo");
    }
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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Meus Materiais</h1>
          <p className="text-muted-foreground">
            Materiais compartilhados pelo seu professor
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar materiais..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              Todos
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                style={{ 
                  backgroundColor: selectedCategory === category.id ? category.color : undefined,
                  borderColor: category.color 
                }}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {filteredMaterials.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchTerm || selectedCategory ? "Nenhum material encontrado" : "Nenhum material disponível"}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedCategory
                  ? "Tente alterar os filtros de busca"
                  : "Seu professor ainda não compartilhou materiais com você"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMaterials.map((access) => {
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
                        Compartilhado: {new Date(access.granted_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDownload(material)}
                      className="w-full"
                      variant="outline"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Material
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
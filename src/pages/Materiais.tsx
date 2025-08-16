import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, FolderPlus, Search, FileText, Download } from "lucide-react";

interface MaterialCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
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

export default function Materiais() {
  const { profile } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (profile?.role === 'professor') {
      loadData();
    }
  }, [profile]);

  const loadData = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('material_categories')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('name');

      if (categoriesError) throw categoriesError;

      // Load materials with categories
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select(`
          *,
          category:material_categories(*)
        `)
        .eq('teacher_id', profile.id)
        .order('created_at', { ascending: false });

      if (materialsError) throw materialsError;

      setCategories(categoriesData || []);
      setMaterials(materialsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(material => 
    material.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    material.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  if (profile?.role !== 'professor') {
    return (
      <Layout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Acesso restrito a professores.</p>
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Materiais de Ensino</h1>
            <p className="text-muted-foreground">Organize e compartilhe seus materiais com os alunos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              <FolderPlus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
            <Button disabled>
              <Upload className="h-4 w-4 mr-2" />
              Novo Material
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar materiais..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredMaterials.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum material encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "Tente alterar os filtros de busca"
                    : "Comece fazendo upload do seu primeiro material"}
                </p>
                <Button disabled>
                  <Upload className="h-4 w-4 mr-2" />
                  Fazer Upload (Em breve)
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((material) => (
                <Card key={material.id} className="group hover:shadow-md transition-shadow">
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
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {material.description}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Tamanho: {formatFileSize(material.file_size)}</div>
                      <div>Criado: {new Date(material.created_at).toLocaleDateString()}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download (Em breve)
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="bg-muted/50 p-4 rounded-lg">
          <h3 className="font-medium mb-2">🚧 Funcionalidades em desenvolvimento:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Upload de materiais</li>
            <li>• Criação de categorias</li>
            <li>• Compartilhamento com alunos</li>
            <li>• Download de arquivos</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
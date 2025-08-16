import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, FolderPlus, Share2, Search, FileText, Download, Trash2, Edit } from "lucide-react";
import { MaterialUploadModal } from "@/components/MaterialUploadModal";
import { CategoryManagerModal } from "@/components/CategoryManagerModal";
import { MaterialAccessModal } from "@/components/MaterialAccessModal";

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

interface MaterialAccess {
  id: string;
  material_id: string;
  student_id: string;
  granted_at: string;
  student_name: string;
}

export default function Materiais() {
  const { profile } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [materialAccess, setMaterialAccess] = useState<MaterialAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Modal states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

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

      // Load material access with student names
      const { data: accessData, error: accessError } = await supabase
        .from('material_access')
        .select(`
          *,
          profiles!material_access_student_id_fkey(name)
        `)
        .eq('granted_by', profile.id);

      if (accessError) throw accessError;

      setCategories(categoriesData || []);
      setMaterials(materialsData || []);
      setMaterialAccess(
        accessData?.map(access => ({
          ...access,
          student_name: (access.profiles as any)?.name || 'Aluno'
        })) || []
      );
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || material.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error("Erro ao baixar arquivo");
    }
  };

  const handleDelete = async (material: Material) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('teaching-materials')
        .remove([material.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('materials')
        .delete()
        .eq('id', material.id);

      if (dbError) throw dbError;

      toast.success("Material excluído com sucesso");
      loadData();
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error("Erro ao excluir material");
    }
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
            <Button onClick={() => setCategoryModalOpen(true)} variant="outline">
              <FolderPlus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
            <Button onClick={() => setUploadModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Novo Material
            </Button>
          </div>
        </div>

        <Tabs defaultValue="materials" className="w-full">
          <TabsList>
            <TabsTrigger value="materials">Meus Materiais</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
            <TabsTrigger value="access">Compartilhamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="materials" className="space-y-4">
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
                  <h3 className="text-lg font-medium mb-2">Nenhum material encontrado</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm || selectedCategory
                      ? "Tente alterar os filtros de busca"
                      : "Comece fazendo upload do seu primeiro material"}
                  </p>
                  {!searchTerm && !selectedCategory && (
                    <Button onClick={() => setUploadModalOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Fazer Upload
                    </Button>
                  )}
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
                                style={{ backgroundColor: `${material.category.color}20`, color: material.category.color }}
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
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(material)}
                          className="flex-1"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Baixar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMaterial(material);
                            setAccessModalOpen(true);
                          }}
                        >
                          <Share2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(material)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => {
                const categoryMaterials = materials.filter(m => m.category_id === category.id);
                return (
                  <Card key={category.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                        </div>
                        <Badge variant="secondary">{categoryMaterials.length}</Badge>
                      </div>
                      {category.description && (
                        <CardDescription>{category.description}</CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="access">
            <Card>
              <CardHeader>
                <CardTitle>Compartilhamentos Ativos</CardTitle>
                <CardDescription>
                  Materiais compartilhados com alunos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {materialAccess.length === 0 ? (
                  <div className="text-center py-8">
                    <Share2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nenhum material foi compartilhado ainda
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {materialAccess.map((access) => {
                      const material = materials.find(m => m.id === access.material_id);
                      if (!material) return null;

                      return (
                        <div key={access.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-4">
                            <span className="text-2xl">{getFileIcon(material.file_type)}</span>
                            <div>
                              <h4 className="font-medium">{material.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                Compartilhado com {access.student_name} em{' '}
                                {new Date(access.granted_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <MaterialUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        categories={categories}
        onSuccess={loadData}
      />

      <CategoryManagerModal
        open={categoryModalOpen}
        onOpenChange={setCategoryModalOpen}
        onSuccess={loadData}
      />

      <MaterialAccessModal
        open={accessModalOpen}
        onOpenChange={setAccessModalOpen}
        material={selectedMaterial}
        onSuccess={loadData}
      />
    </Layout>
  );
}
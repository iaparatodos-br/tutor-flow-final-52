import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { SecurityMonitoringDashboard } from '@/components/SecurityMonitoringDashboard';
import { SecurityDocumentation } from '@/components/SecurityDocumentation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { Shield, FileText, Eye, Lock } from 'lucide-react';

export default function Seguranca() {
  const { profile, isProfessor } = useAuth();

  // Só professores podem acessar a página de segurança
  if (!isProfessor) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <CardTitle>Acesso Restrito</CardTitle>
              <CardDescription>
                Esta seção é acessível apenas para professores.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Centro de Segurança</h1>
            <p className="text-muted-foreground">
              Monitoramento, auditoria e documentação de segurança do sistema
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Sistema Protegido</span>
          </div>
        </div>

        {/* Tabs principais */}
        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monitoring" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Monitoramento
            </TabsTrigger>
            <TabsTrigger value="documentation" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring">
            <SecurityMonitoringDashboard />
          </TabsContent>

          <TabsContent value="documentation">
            <SecurityDocumentation />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
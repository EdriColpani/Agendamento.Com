import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getStatusColor } from '@/lib/dashboard-utils';

const FidelidadePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Fidelidade e Promoções</h1>
        <Button className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90">
          <i className="fas fa-plus mr-2"></i>
          Nova Promoção
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Configuração de Pontos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <h3 className="font-semibold text-amber-900 mb-2">Regras Atuais</h3>
              <ul className="space-y-1 text-sm text-primary">
                <li>• 1 ponto para cada R$ 1,00 gasto</li>
                <li>• 100 pontos = R$ 10,00 de desconto</li>
                <li>• Pontos expiram em 12 meses</li>
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pontos por Real gasto
                </label>
                <Input type="number" defaultValue="1" className="border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pontos para desconto
                </label>
                <Input type="number" defaultValue="100" className="border-gray-300 text-sm" />
              </div>
              <Button className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 w-full">
                Salvar Configurações
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Criar Cupom de Desconto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código do Cupom
              </label>
              <Input placeholder="Ex: DESCONTO20" className="border-gray-300 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Desconto
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option>Percentual</option>
                <option>Valor Fixo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor do Desconto
              </label>
              <Input type="number" placeholder="20" className="border-gray-300 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Validade
              </label>
              <Input type="date" className="border-gray-300 text-sm" />
            </div>
            <Button className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 w-full">
              Criar Cupom
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Promoções Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { codigo: 'DESCONTO20', tipo: '20% de desconto', validade: '31/12/2025', usos: 45, status: 'ativa' },
              { codigo: 'PRIMEIRA10', tipo: 'R$ 10,00 de desconto', validade: '15/11/2025', usos: 12, status: 'ativa' },
              { codigo: 'FIDELIDADE', tipo: '15% de desconto', validade: '30/11/2025', usos: 78, status: 'pausada' }
            ].map((promocao, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-ticket-alt text-primary"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{promocao.codigo}</h3>
                    <p className="text-sm text-gray-600">{promocao.tipo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Válido até {promocao.validade}</p>
                  <p className="text-sm text-gray-600">{promocao.usos} usos</p>
                </div>
                <Badge className={`${getStatusColor(promocao.status)} text-white text-xs`}>
                  {promocao.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FidelidadePage;
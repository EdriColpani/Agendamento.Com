import React, { useState, useMemo } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from "react-day-picker"; // Importar DateRange do react-day-picker
import { DateRangePicker } from "@/components/ui/date-range-picker"; // Importar o novo DateRangePicker

interface ServiceCommissionDetail {
  serviceId: string;
  serviceName: string;
  commission: number;
  appointmentDate: string; // Adicionado a data do agendamento
}

interface ServiceCommissionDetailModalProps {
  open: boolean;
  onClose: () => void;
  collaboratorName: string;
  serviceCommissions: ServiceCommissionDetail[];
  allServiceNames: string[]; // Receber todos os nomes de serviços para o filtro
}

export const ServiceCommissionDetailModal: React.FC<ServiceCommissionDetailModalProps> = ({
  open,
  onClose,
  collaboratorName,
  serviceCommissions,
  allServiceNames,
}) => {
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateRange | undefined>(undefined); // Usar DateRange

  const filteredCommissions = useMemo(() => {
    return serviceCommissions.filter(detail => {
      const matchesService = !selectedServiceFilter || detail.serviceName === selectedServiceFilter;
      
      // Ajustar a lógica de filtragem de data para usar DateRange
      const matchesDate = !selectedDateFilter?.from || !selectedDateFilter?.to || (
        isWithinInterval(parseISO(detail.appointmentDate), { start: selectedDateFilter.from, end: selectedDateFilter.to })
      );
      
      return matchesService && matchesDate;
    });
  }, [serviceCommissions, selectedServiceFilter, selectedDateFilter]);

  const handleExport = () => {
    const headers = ["Serviço", "Data", "Comissão (R$)"];
    const csvContent = filteredCommissions.map(detail => 
      `"${detail.serviceName}","${format(parseISO(detail.appointmentDate), 'dd/MM/yyyy')}","${detail.commission.toFixed(2).replace('.', ',')}"`
    ).join("\n");
    
    const fullCsv = `${headers.join(",")}\n${csvContent}`;
    
    const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `comissao_servicos_${collaboratorName.replace(/\s/g, '_')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    const printContent = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="font-size: 24px; margin-bottom: 10px;">Comissão por Serviço de ${collaboratorName}</h1>
        <p style="font-size: 14px; color: #555; margin-bottom: 20px;">
          Detalhes da comissão gerada por cada serviço prestado por ${collaboratorName} no período selecionado.
          ${selectedServiceFilter ? ` (Serviço: ${selectedServiceFilter})` : ''}
          ${selectedDateFilter?.from && selectedDateFilter?.to ? ` (Período: ${format(selectedDateFilter.from, 'dd/MM/yyyy')} a ${format(selectedDateFilter.to, 'dd/MM/yyyy')})` : ''}
        </p>
        ${filteredCommissions.length === 0 ? 
          `<p style="color: #666;">Nenhum serviço com comissão para este colaborador no período.</p>` 
          : 
          `<ul style="list-style: none; padding: 0;">
            ${filteredCommissions.map(detail => `
              <li style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                <span>${detail.serviceName} - ${format(parseISO(detail.appointmentDate), 'dd/MM/yyyy')}</span>
                <span style="font-weight: bold;">R$ ${detail.commission.toFixed(2).replace('.', ',')}</span>
              </li>
            `).join('')}
          </ul>`
        }
      </div>
    `;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Relatório de Comissão</title>');
      printWindow.document.write('<style>@media print { body { -webkit-print-color-adjust: exact; } ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; } }</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContent);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Comissão por Serviço de {collaboratorName}</AlertDialogTitle>
          <AlertDialogDescription>
            Detalhes da comissão gerada por cada serviço prestado por {collaboratorName} no período selecionado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex gap-4">
            {/* Filtro por Serviço */}
            <Select 
              onValueChange={(value) => setSelectedServiceFilter(value === "all" ? null : value)} 
              value={selectedServiceFilter || "all"}
            >
              <SelectTrigger className="w-1/2">
                <SelectValue placeholder="Filtrar por Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Serviços</SelectItem>
                {allServiceNames.map(serviceName => (
                  <SelectItem key={serviceName} value={serviceName}>
                    {serviceName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro por Data */}
            <DateRangePicker
              date={selectedDateFilter}
              setDate={setSelectedDateFilter}
              className="w-1/2" // Adicionar classes de estilo aqui, se necessário
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto border p-2 rounded-md">
            {filteredCommissions.length === 0 ? (
              <p className="text-gray-600 text-center">Nenhum serviço com comissão encontrado para os filtros selecionados.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {filteredCommissions.map((serviceDetail, index) => (
                    <li key={index} className="flex justify-between text-sm text-gray-700">
                      <span>{serviceDetail.serviceName} ({format(parseISO(serviceDetail.appointmentDate), 'dd/MM/yyyy')})</span>
                      <span className="font-medium">R$ {serviceDetail.commission.toFixed(2).replace('.', ',')}</span>
                    </li>
                  ))}
                </ul>
                {/* Rodapé com soma total */}
                <div className="border-t pt-2 mt-2 flex justify-between items-center font-bold text-gray-900">
                  <span>Total:</span>
                  <span className="text-primary">
                    R$ {filteredCommissions.reduce((sum, detail) => sum + detail.commission, 0).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleExport}>
            Exportar
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            Imprimir
          </Button>
          <AlertDialogCancel>Fechar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
// Removido import de ScrollArea, usando div com overflow-y-auto

interface ContractAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: {
    id: string;
    contract_name: string;
    contract_content: string;
  } | null;
  onAccept: () => void;
  loading: boolean;
}

const ContractAcceptanceModal: React.FC<ContractAcceptanceModalProps> = ({
  isOpen,
  onClose,
  contract,
  onAccept,
  loading,
}) => {
  const [accepted, setAccepted] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset states when modal opens
    if (isOpen) {
      setAccepted(false);
      setScrolledToBottom(false);
      // Check if already at bottom on initial render (for short contracts)
      const checkScroll = () => {
        if (scrollRef.current) {
          const { scrollHeight, clientHeight } = scrollRef.current;
          if (scrollHeight <= clientHeight) {
            setScrolledToBottom(true);
          }
        }
      };
      // Give a small delay to ensure content is rendered before checking scroll
      const timer = setTimeout(checkScroll, 100); 
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Check if user has scrolled to the very bottom (with a small tolerance)
      if (scrollTop + clientHeight >= scrollHeight - 5) { 
        setScrolledToBottom(true);
      }
    }
  };

  if (!contract) {
    return null; // Ou renderizar um estado de carregamento/erro
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Termos e Condições: {contract.contract_name}</DialogTitle>
          <DialogDescription>
            Por favor, leia o contrato abaixo e aceite os termos para continuar com o cadastro da sua empresa.
          </DialogDescription>
        </DialogHeader>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 p-4 border rounded-md my-4 overflow-y-auto"
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {contract.contract_content}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-4">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(!!checked)}
            disabled={!scrolledToBottom}
          />
          <Label htmlFor="terms" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Eu li e aceito os termos do contrato.
          </Label>
        </div>
        <DialogFooter className="flex justify-between items-center mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="!rounded-button whitespace-nowrap"
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onAccept}
            disabled={!accepted || loading}
            className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? 'Cadastrando...' : 'Aceitar e Cadastrar Empresa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContractAcceptanceModal;
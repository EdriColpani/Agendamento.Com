import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    image_url: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  isSelected: boolean;
  onClick: (companyId: string) => void;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company, isSelected, onClick }) => {
  const displayAddress = company.address && company.city && company.state
    ? `${company.address}, ${company.city} - ${company.state}`
    : company.city && company.state
      ? `${company.city} - ${company.state}`
      : 'Endereço não disponível';

  return (
    <Card
      className={cn(
        "cursor-pointer hover:border-primary transition-all duration-200",
        isSelected ? "border-primary ring-2 ring-primary" : "border-gray-200"
      )}
      onClick={() => onClick(company.id)}
    >
      <CardContent className="flex items-center p-4">
        <img
          src={company.image_url || "/placeholder-company.png"} // Substitua por um placeholder real
          alt={company.name}
          className="w-16 h-16 rounded-full object-cover mr-4 border border-gray-200"
        />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
          <p className="text-sm text-gray-500">{displayAddress}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompanyCard;


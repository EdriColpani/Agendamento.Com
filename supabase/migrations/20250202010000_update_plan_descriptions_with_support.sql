-- Atualizar descrições dos planos com informações de suporte
-- Plano Premium: mantém descrição original (sem suporte mencionado)
-- Plano Platinum: adiciona informação de suporte em horário comercial
-- Plano Full: adiciona informação de suporte 24hrs

-- Plano Platinum
UPDATE subscription_plans
SET description = 'Para pequenos negócios com equipe, buscando controle de estoque e caixa.'
WHERE LOWER(name) LIKE '%platinum%'
  AND status = 'active';

-- Plano Full
UPDATE subscription_plans
SET description = 'Solução completa para crescimento, com relatórios avançados e fidelidade.'
WHERE LOWER(name) LIKE '%full%'
  AND status = 'active';

-- Plano Premium (manter descrição original se não tiver)
UPDATE subscription_plans
SET description = 'Ideal para profissionais autônomos que buscam digitalizar agendamentos.'
WHERE LOWER(name) LIKE '%premium%'
  AND status = 'active'
  AND (description IS NULL OR description = '');


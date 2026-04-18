# Padronização de botões — ponto para retomar

## Já feito (módulo Quadras / barra superior)

- **`src/components/arena/ArenaToolbar.tsx`**
  - Padrão visual exportado: **`arenaToolbarSolidClass`** — fundo `primary` (verde/teal), texto branco, `border-2 border-white`, hover `primary/90`.
  - **`arenaToolbarBtnClass`** — altura, pill (`rounded-full`), padding.
  - Botão **voltar**, **links do sub-menu** e (onde aplicado) **trailing** (ex.: Atualizar em pacotes mensais) usam esse padrão.
  - Item da rota ativa: mesmo esquema de cores + **anel** (`ring-2 ring-white` + offset) para acessibilidade.

- **`src/components/arena/arenaNavConfig.ts`** — `getArenaModuleLinks`, `isArenaNavItemActive` (inclui normalização de `/` final).

- **`src/pages/CourtMonthlyPackagesPage.tsx`** — imports de `arenaToolbarBtnClass` + `arenaToolbarSolidClass` no botão **Atualizar** da barra (verificar se permanece após merges).

## Ainda fora do padrão (próximos passos)

1. **Agenda (`CourtAgendaPage.tsx`)**  
   - Faixa de **datas** (dias da semana): hoje usa `Button` default/outline; avaliar alinhar a **`arenaToolbarSolidClass`** ou variante só para o dia selecionado, sem poluir o layout.

2. **Busca global no front** por estilos antigos / inconsistentes:
   - `!rounded-button` (muito usado no projeto — pode mapear para `rounded-full` + classes do tema).
   - `variant="outline"` + classes manuais `bg-primary` misturadas.
   - Botões com **`bg-yellow`** (se restar algum após migração de cores).
   - **`Button`** sem `variant`, só `className` longo.

   Comandos úteis (na raiz do repo):

   ```bash
   rg "rounded-button" src --glob "*.tsx"
   rg "variant=\"outline\"" src/pages --glob "*Court*"
   ```

3. **Modais de quadras** (`CourtsManagementPage`, reserva, etc.)  
   - Footer **Salvar / Cancelar** — hoje misturam `rounded-full`, `primary`, `outline`; definir se seguem **shadcn padrão** (`variant default` + `outline`) ou o mesmo **pill verde/branco** só na área arena.

4. **Landing / login geral**  
   - Fora do escopo arena; padronização pode ser **tokens globais** (`Button` default = primary) sem borda branca em todo o sistema.

## Decisão de produto pendente

- **Opção A:** Padrão “arena” (verde + borda branca) **só** na barra `ArenaToolbar` e telas irmãs.  
- **Opção B:** Estender o mesmo visual a **todos** os CTAs do app (impacto grande).

Registrar aqui qual opção foi escolhida antes de refatorar em massa.

## Arquivos-chave

| Área        | Arquivo |
|------------|---------|
| Barra arena | `src/components/arena/ArenaToolbar.tsx` |
| Lista quadras / modais | `src/pages/CourtsManagementPage.tsx` |
| Agenda      | `src/pages/CourtAgendaPage.tsx` |
| UI base     | `src/components/ui/button.tsx`, `src/globals.css` (`--primary`) |

---

*Última atualização: continuação da padronização de botões; ainda há botões fora do padrão fora da barra arena.*

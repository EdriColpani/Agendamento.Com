# Tela de login arena (`/arena`) — ponto para retomar

## O que já existe

- Rota: **`/arena`** → `src/pages/ArenaLoginPage.tsx`
- O formulário é o **`LoginForm`** (mesmo de `/login`; auth não foi alterado)
- Link “Acesso ao login geral” aponta para `/login`

## Imagens do painel esquerdo

1. Colocar arquivos em **`public/arena/`** (ex.: `public/arena/quadra-1.jpg`)
2. No código, editar o array no topo de **`src/pages/ArenaLoginPage.tsx`**:

   `ARENA_LOGIN_MARKETING_IMAGE_URLS`

3. Usar caminhos com **barra inicial**, sem `public`:

   - Correto: `'/arena/quadra-1.jpg'`
   - Errado: `'public/arena/quadra-1.jpg'`

4. Até **4** URLs/caminhos; posições vazias usam placeholders com ícones.

## Próximos passos (quando voltar)

- Preencher o array com as imagens finais
- Ajustar textos do painel laranja em `ArenaLoginPage.tsx` (`marketingLines`) se quiser outra copy
- Opcional: trocar ícones dos placeholders ou layout mobile

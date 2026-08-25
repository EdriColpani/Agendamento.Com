# Evolution API — Versão e Licenciamento (PlanoAgenda)

## Decisão de produto

* Uso **somente** da edição **Community / self-hosted**.
* **Não** contratado plano comercial da Evolution nesta etapa.
* **Não** utilizado serviço gerenciado / cloud pago da Evolution.

## Versão pinada

| Item | Valor |
|------|--------|
| Projeto | Evolution API (Evolution Foundation) |
| Release | **2.3.7** |
| Imagem Docker | `evoapicloud/evolution-api:v2.3.7` |
| Integração WhatsApp | **WHATSAPP-BAILEYS** (modo suportado pela Community) |
| Data de registro no PlanoAgenda | 25/08/2026 |

Fonte da release: https://github.com/evolution-foundation/evolution-api/releases/tag/2.3.7

## Licença

Conforme `LICENSE` do repositório oficial (Apache License 2.0 **com condições adicionais**):

1. **Apache 2.0** como base.
2. Condições adicionais da Evolution Foundation, incluindo:
   * Não remover logo/copyright do frontend/console Evolution (quando o Manager for usado).
   * **Notificação de uso:** se Evolution for usada em projeto (inclusive closed-source), deve haver notificação clara para administradores / documentação de que a Evolution API está sendo utilizada.
3. Descumprimento dessas condições pode exigir licença comercial, conforme o produtor.

Contato oficial de licensing citado na LICENSE: suporte@evofoundation.com.br

**Conclusão:** “open source” **não** significa ausência de obrigações. O PlanoAgenda deve manter esta nota e, na UI admin (fase posterior), um aviso de que notificações WhatsApp podem usar Evolution API Community.

## Escopo no PlanoAgenda

Permitido nesta implementação:

* Self-host Docker
* API key própria (`AUTHENTICATION_API_KEY`)
* Instâncias Baileys
* Envio de texto para lembretes/agradecimento

Proibido nesta etapa:

* Plano comercial Evolution
* SaaS gerenciado Evolution
* Chatbot / CRM / campanhas / mídia (fora do escopo do produto)

## Revisão futura

Antes de produção em escala, revisar se a tag 2.3.7 permanece adequada e se as obrigações de atribuição/notificação estão cumpridas na interface admin.

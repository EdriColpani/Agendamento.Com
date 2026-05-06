# Arquitetura proposta: IP e geolocalizacao no login

## Objetivo

Documentar uma arquitetura segura e escalavel para identificar IP e cidade no momento de login, sem bloquear a autenticacao.

## Principios

- Nao bloquear o login por dependencia de GeoIP.
- Separar captura de evento e enriquecimento geografico.
- Confiar apenas no IP observado no backend.
- Aplicar privacidade por padrao (LGPD): minimizacao, retencao e acesso restrito.

## Fluxo recomendado

1. Usuario realiza login normalmente.
2. Backend/Edge Function registra evento de login com `user_id`, `company_id`, `timestamp`, `ip`, `user_agent` e resultado.
3. Evento fica marcado para enriquecimento (`geo_status = pending`).
4. Worker assíncrono processa em lote e consulta provedor GeoIP.
5. Sistema grava `country`, `region`, `city`, `timezone`, `asn/isp` (quando aplicavel), `geo_confidence` e score de risco.
6. Dashboard exibe ultimos acessos e alertas (pais novo, deslocamento improvavel, IP suspeito).

## Componentes sugeridos

- Edge Function/API de auditoria de login.
- Tabela `security_login_events`.
- Worker agendado para enriquecimento.
- Provedor GeoIP principal e fallback.
- Regras de risco (score).
- Painel administrativo com RLS.

## Modelo de dados (MVP)

Tabela `security_login_events`:

- `id`
- `user_id`
- `company_id`
- `occurred_at`
- `auth_result` (`success`/`failed`)
- `ip` (preferencialmente criptografado ou mascarado)
- `ip_hash` (correlacao sem expor IP completo)
- `user_agent`
- `geo_status` (`pending`/`resolved`/`failed`)
- `country_code`
- `region`
- `city`
- `latitude` (opcional)
- `longitude` (opcional)
- `timezone` (opcional)
- `asn` (opcional)
- `isp` (opcional)
- `is_vpn_proxy` (opcional)
- `geo_provider`
- `geo_confidence`
- `risk_score`
- `risk_reasons` (jsonb)

## Pipeline de geolocalizacao

1. Normalizar IP (IPv4/IPv6) e extrair IP publico valido da cadeia de proxy.
2. Consultar cache por IP (TTL sugerido: 24h).
3. Chamar provedor GeoIP com timeout curto.
4. Em falha, acionar provedor fallback.
5. Persistir dados com metadados de confianca.

## Observacoes importantes

- Cidade por IP e estimativa, nao prova absoluta.
- VPN, CGNAT e redes moveis reduzem precisao.
- Use geolocalizacao como sinal de risco, nao como fator unico de bloqueio.

## Seguranca e conformidade

- Definir base legal e politica de retencao.
- Restringir acesso via RLS.
- Evitar armazenar IP em texto puro indefinidamente.
- Considerar purge automatico (ex.: 90/180 dias).

## Escalabilidade

- Arquitetura assincrona evita impactar latencia de login.
- Processamento em lote reduz custo de API externa.
- Cache por IP e fallback aumentam resiliencia.

## Fases sugeridas

### Fase 1 (MVP)

Registrar evento de login com IP e user agent.

### Fase 2

Adicionar enriquecimento GeoIP assincrono e tela de ultimos acessos.

### Fase 3

Introduzir score de risco e alertas operacionais.

### Fase 4

Ativar respostas adaptativas (ex.: MFA contextual e bloqueio por risco).

---

Status: documento salvo para analise futura de necessidade e priorizacao.

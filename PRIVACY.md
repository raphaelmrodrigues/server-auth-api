# Política de Privacidade — GladiusBot

**Última atualização:** 17 de junho de 2026  
**Produto:** GladiusBot (extensão para navegador Chrome / Chromium)  
**Site oficial:** https://gldbotserver.com  
**Contato:** gldbotsuport@gmail.com

---

## 1. Sobre o GladiusBot

O **GladiusBot** é um assistente de automação para o jogo **Gladiatus** (Gameforge), distribuído como extensão de navegador. Esta política descreve como tratamos informações quando você usa a extensão e os serviços em `gldbotserver.com`.

**Esclarecimentos importantes:**

- **GladiusBot** é um produto independente. Não deve ser confundido com qualquer outro bot de terceiros com nome semelhante.
- O GladiusBot **não é afiliado, endossado ou mantido pela Gameforge** nem pelo Gladiatus.
- O uso da extensão pode estar sujeito aos termos de uso do jogo; essa responsabilidade é do usuário.

---

## 2. Dados que coletamos

### 2.1 Dados fornecidos por você

| Dado | Quando | Finalidade |
|------|--------|------------|
| **Chave de licença** | Ativação no modal da extensão | Vincular licença ao seu personagem e validar acesso |
| **Player ID** (identificador do personagem no Gladiatus) | Ativação e uso do bot | Associar licença, sessão e funcionalidades ao personagem correto |
| **E-mail** | Compra de licença no site | Entrega da chave, suporte e comunicações de pagamento |
| **Mensagens de contato** | Formulário do site | Suporte ao cliente |

### 2.2 Dados gerados automaticamente

| Dado | Origem | Finalidade |
|------|--------|------------|
| **Token de sessão (JWT)** | Servidor após validação de licença | Manter sessão segura e impedir uso não autorizado |
| **Data de expiração da licença** | Servidor | Controlar validade do acesso |
| **Registros de validação** (sucesso/falha, horário, motivo genérico) | Servidor (`/validate-key`, `/validate-license`, `/v-s`) | Segurança, anti-fraude e monitoramento operacional |
| **Versão da extensão** | Enviada no heartbeat `/v-s` enquanto o bot está ativo | Suporte, compatibilidade e estatísticas agregadas de uso |
| **Servidor do jogo** (número do servidor e região, ex.: `s12-br`) | Extraído da URL do Gladiatus durante o heartbeat | Monitoramento operacional agregado (sem identificar além do Player ID já vinculado) |
| **Estado “bot ativo”** (sim/não) | Sessão da extensão durante o heartbeat | Saber se a automação está em execução no momento do sinal |
| **Preferências do bot** | Armazenamento local do navegador (`localStorage` / `sessionStorage`) | Salvar configurações da extensão (ações, listas, estado do bot) |
| **Dados de pagamento** | Stripe / Mercado Pago | Processamento de compras (tratados pelos gateways; não armazenamos cartão completo) |

### 2.3 O que não coletamos intencionalmente

- Senha da sua conta Gameforge / Gladiatus  
- Conteúdo de mensagens privadas no jogo além do necessário para o funcionamento do bot  
- Dados de navegação fora dos domínios Gladiatus e `gldbotserver.com` relacionados ao serviço  

---

## 3. Como usamos os dados

Utilizamos as informações exclusivamente para:

1. **Autenticar e gerenciar licenças** (ativação, trial, renovação, expiração).  
2. **Operar a extensão** (validação periódica de sessão e heartbeat operacional enquanto o bot está em uso).  
3. **Exibir anúncios globais** configurados pelo administrador (texto informativo na extensão).  
4. **Processar pagamentos** e emitir licenças.  
5. **Prestar suporte** e responder contatos.  
6. **Proteger o serviço** contra fraude, crack e uso indevido de licenças.  

**Não vendemos** seus dados pessoais a terceiros.

---

## 4. Onde os dados ficam armazenados

| Local | O que fica lá |
|-------|----------------|
| **Seu navegador** (extensão) | Configurações, token de sessão, data de licença, preferências do bot |
| **Servidor GladiusBot** (`gldbotserver.com`) | Licenças, player ID vinculado, e-mail de compra, logs de validação, metadados operacionais de heartbeat (versão, servidor do jogo), anúncios globais |
| **MongoDB** (infraestrutura do servidor) | Registros de licenças e auditoria de vendas |
| **Stripe / Mercado Pago** | Dados de transação financeira |

Dados na extensão permanecem no dispositivo até você limpar cache/dados do navegador ou desinstalar a extensão.

---

## 5. Compartilhamento com terceiros

Compartilhamos dados apenas quando necessário:

| Terceiro | Motivo |
|----------|--------|
| **Gameforge (Gladiatus)** | A extensão interage com as páginas do jogo no seu navegador; nenhum dado é enviado à Gameforge pelo nosso servidor além do que o próprio jogo já processa na sua sessão |
| **Stripe / Mercado Pago** | Pagamento de licenças |
| **SendGrid** | Envio de e-mails de contato e notificações |
| **Provedor de hospedagem** | Operação do servidor e banco de dados |

Não autorizamos terceiros a usar seus dados para marketing próprio.

---

## 6. Comunicação da extensão com a rede

A extensão comunica-se com:

- `https://*.gladiatus.gameforge.com` — páginas do jogo  
- `https://gldbotserver.com` — validação de licença, sessão, anúncios e recursos do bot  

Heartbeats de sessão (`/v-s`) ocorrem aproximadamente a cada **3 minutos** enquanto o bot está ativo (automação ligada ou aba do bot aberta), apenas para validar a licença e registrar sinal operacional. Cada heartbeat pode incluir a **versão da extensão**, o **servidor do jogo** em que você está jogando (derivado da URL do Gladiatus) e se o bot está **ativo** no momento. Esses dados não incluem senha, mensagens privadas nem conteúdo do jogo além do necessário para o funcionamento do serviço.

Não há rastreamento contínuo fora desse contexto: quando o bot está desligado e a aba não está em uso, a extensão não envia heartbeats.

---

## 7. Retenção

- **Licenças ativas:** mantidas enquanto a licença existir ou for necessário para suporte e obrigações legais.  
- **Logs de validação (monitoramento):** em memória no servidor, rotacionados automaticamente (não persistem após reinício do servidor). Incluem contagem de heartbeats e metadados operacionais agregados (versão, servidor).  
- **Dados de auditoria de vendas:** mantidos para fins contábeis e de suporte.  
- **Dados locais na extensão:** permanecem até você removê-los ou desinstalar a extensão.  

---

## 8. Seus direitos

Dependendo da sua jurisdição (incluindo LGPD no Brasil), você pode solicitar:

- Confirmação de tratamento de dados  
- Acesso aos dados associados à sua licença  
- Correção de dados incorretos (ex.: e-mail de compra)  
- Exclusão, quando aplicável e não conflitar com obrigações legais ou licenças ativas  

Envie pedidos para **gldbotsuport@gmail.com** com o assunto `Privacidade GladiusBot` e informe sua chave de licença ou e-mail de compra.

---

## 9. Segurança

Adotamos medidas como:

- Tokens de sessão assinados (JWT)  
- Validação de licença no servidor  
- Comunicação HTTPS  
- Acesso administrativo protegido por autenticação  

Nenhum sistema é 100% seguro; recomendamos não compartilhar sua chave de licença e manter seu navegador atualizado.

---

## 10. Menores de idade

O GladiusBot não é direcionado a menores de 13 anos. Não coletamos intencionalmente dados de crianças. Se acreditar que coletamos dados de um menor, contacte-nos para remoção.

---

## 11. Alterações nesta política

Podemos atualizar esta política periodicamente. A data no topo indica a versão vigente. Alterações relevantes podem ser comunicadas no site ou na extensão. O uso continuado após a publicação constitui aceitação da versão atualizada.

---

## 12. Contato

**GladiusBot — Privacidade e suporte**  
E-mail: gldbotsuport@gmail.com  
Site: https://gldbotserver.com  
Política online: https://gldbotserver.com/privacy  

---

*Documento aplicável exclusivamente ao produto **GladiusBot**. Marcas de terceiros (Gladiatus, Gameforge, Chrome) pertencem aos seus respectivos proprietários.*

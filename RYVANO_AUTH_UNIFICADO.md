# ryvano — Unificação de Login e Cadastro

## Objetivo

Reformular completamente a experiência de autenticação do ryvano para transformar as páginas atuais de **Entrar** e **Cadastro** em uma experiência única, simples, clara e com menor atrito.

O objetivo é:

- remover a separação artificial entre login e cadastro;
- criar uma única tela de acesso;
- priorizar autenticação com Google;
- permitir login e criação de conta no mesmo card;
- evitar pedir login novamente após cadastro;
- detectar sessão válida automaticamente;
- redirecionar usuários já autenticados sem mostrar formulário;
- preservar onboarding incompleto;
- melhorar textos, hierarquia visual e conversão;
- reduzir campos e decisões desnecessárias;
- manter compatibilidade com rotas existentes.

A implementação deve respeitar a arquitetura atual do projeto Next.js e Auth.js já existente.

---

# 1. Estado atual identificado

Hoje existem duas telas separadas:

```text
/entrar
/cadastro
```

A tela de cadastro contém linguagem técnica e pouco orientada ao usuário, por exemplo:

```text
Primeira etapa reduzida: nome, email e senha.
Dados pessoais, endereço, Garmin e WhatsApp são concluídos no onboarding.
```

Também existe uma mensagem explicando o fluxo técnico posterior.

A tela de login também contém texto técnico como:

```text
Login por email e senha via Auth.js.
Google OAuth aparece quando credenciais estiverem configuradas no ambiente.
```

Esses textos NÃO devem continuar visíveis ao usuário final.

A UI pública não deve explicar:

- Auth.js;
- OAuth configurado no ambiente;
- estratégia interna de onboarding;
- arquitetura de autenticação;
- sequência técnica de cadastro/login.

---

# 2. Nova estratégia

Criar uma única experiência de autenticação.

Rota principal recomendada:

```text
/entrar
```

Alternativamente:

```text
/acesso
```

Preferência: manter `/entrar` para reduzir mudança de rotas existentes.

A rota `/cadastro` deve continuar funcionando apenas como compatibilidade.

Ao acessar:

```text
/cadastro
```

redirecionar para:

```text
/entrar?modo=cadastro
```

ou outra abordagem equivalente que preserve o modo selecionado.

Não manter duas implementações independentes.

---

# 3. Princípio principal

O usuário deve enxergar apenas uma tela de acesso com:

1. botão de Google;
2. opção de Entrar;
3. opção de Criar conta.

Estrutura:

```text
ryvano

Continue para seus treinos

Acesse suas atividades, evolução
e relatórios esportivos em um só lugar.

[ G  Continuar com Google ]

────────── ou continue com ──────────

[ Entrar ] [ Criar conta ]

<form correspondente>
```

---

# 4. Google NÃO pertence a uma aba

O botão do Google deve ficar sempre visível acima das opções:

```text
Entrar
Criar conta
```

Texto obrigatório:

```text
Continuar com Google
```

NÃO usar:

```text
Entrar com Google
```

e em outro modo:

```text
Cadastrar com Google
```

O usuário não precisa decidir se Google é login ou cadastro.

O backend deve resolver automaticamente.

---

# 5. Regra do Google

Fluxo esperado:

```text
Usuário clica "Continuar com Google"
              ↓
Google OAuth
              ↓
callback
              ↓
identificar usuário pelo providerAccountId/email
              ↓
usuário existe?
       ↙             ↘
     SIM             NÃO
      ↓               ↓
 recuperar         criar usuário
 usuário              ↓
      └───────────────┘
              ↓
          criar sessão
              ↓
 verificar onboarding
```

---

# 6. Destino após Google

## Usuário existente + onboarding completo

```text
→ dashboard/home autenticada
```

## Usuário existente + onboarding incompleto

```text
→ continuar onboarding
```

## Usuário novo

```text
→ onboarding
```

Não mandar usuário novo do Google para uma tela de cadastro.

Ao autenticar com Google, a identidade já foi confirmada.

---

# 7. Cadastro por email e senha

O cadastro também deve autenticar automaticamente.

Fluxo correto:

```text
Criar conta
    ↓
criar usuário
    ↓
criar sessão
    ↓
onboarding
```

Fluxo proibido:

```text
Criar conta
    ↓
redirecionar para login
    ↓
pedir email e senha novamente
```

Depois de criar a conta com credenciais válidas, o usuário já deve estar autenticado.

---

# 8. Verificação de sessão antes de renderizar

Sempre que o usuário acessar:

```text
/entrar
/cadastro
```

verificar primeiro se já existe sessão válida.

Fluxo:

```text
Request
  ↓
verificar sessão
  ↓
sessão válida?
   ↙       ↘
 SIM       NÃO
 ↓          ↓
buscar      mostrar
usuário     AuthPage
 ↓
onboarding completo?
 ↙              ↘
SIM             NÃO
 ↓               ↓
dashboard       onboarding
```

---

# 9. Não mostrar flash do formulário

A verificação deve preferencialmente ocorrer no servidor.

O usuário autenticado NÃO deve:

1. abrir `/entrar`;
2. enxergar formulário;
3. depois ser redirecionado.

O redirecionamento deve ocorrer antes da renderização do formulário quando possível.

No Next.js, verificar a estratégia já existente e usar a abordagem mais adequada:

- Server Component;
- layout;
- page;
- middleware;
- auth guard já existente.

Não duplicar lógica de autenticação.

---

# 10. Sessão persistente

Importante:

A regra é:

```text
se existe sessão válida → não pedir login novamente
```

NÃO:

```text
se já logou alguma vez → nunca mais pedir login
```

Sessão deve continuar respeitando:

- expiração;
- revogação;
- logout;
- invalidação;
- políticas de segurança.

---

# 11. Nova estrutura visual

## Desktop

Usar duas colunas.

Estrutura:

```text
┌──────────────────────────────────────────────────────────┐
│ ryvano                                                    │
│                                                          │
│ Seus treinos,                  ┌───────────────────────┐  │
│ todos em um só lugar.          │ Continue no ryvano     │  │
│                                │                       │  │
│ Corrida, ciclismo,             │ [ Continuar Google ]  │  │
│ natação e triathlon.           │                       │  │
│                                │ ─────── ou ─────────  │  │
│ 🏊   🚴   🏃                    │                       │  │
│                                │ Entrar | Criar conta  │  │
│ Acompanhe suas atividades,     │                       │  │
│ evolução e relatórios.         │ formulário            │  │
│                                │                       │  │
│                                └───────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

A coluna esquerda deve comunicar benefício.

A coluna direita deve ser somente ação/autenticação.

---

# 12. Coluna esquerda — copy

Badge opcional:

```text
SEUS TREINOS EM UM SÓ LUGAR
```

Título recomendado:

```text
Continue acompanhando sua evolução.
```

Alternativa:

```text
Seus treinos, todos em um só lugar.
```

Texto:

```text
Corrida, ciclismo, natação e triathlon com atividades, evolução e relatórios fáceis de acompanhar.
```

Evitar textos longos.

Evitar explicar onboarding.

Evitar mencionar tecnologia.

---

# 13. Coluna esquerda — elementos visuais

Pode incluir:

```text
🏊 Natação
🚴 Ciclismo
🏃 Corrida
```

Mas na UI do projeto usar `SportIcon`, não emoji, se o sistema de ícones já estiver disponível.

Exemplo:

```tsx
<SportIcon sport="swimming" />
<SportIcon sport="cycling" />
<SportIcon sport="running" />
```

Usar cores semânticas já definidas.

Não transformar a tela de login em uma landing page longa.

---

# 14. Mobile

No mobile, remover a coluna promocional extensa.

Estrutura:

```text
ryvano

Continue para seus treinos

Acesse suas atividades, evolução
e relatórios esportivos.

[ G  Continuar com Google ]

──────────── ou ────────────

[ Entrar ] [ Criar conta ]

<form>

Termos / Privacidade
```

A tela deve caber naturalmente sem excesso de scroll.

---

# 15. Bottom Navigation

NÃO mostrar a Bottom Navigation principal da aplicação nessa tela.

Usuário não autenticado não precisa acessar:

```text
Home
Atividades
Evolução
Perfil
```

A navegação de autenticação deve ser isolada da navegação do app autenticado.

---

# 16. Header

Header mínimo.

Exemplo:

```text
ryvano
```

Opcionalmente:

```text
Voltar para início
```

Não colocar simultaneamente:

```text
Entrar
Cadastro
```

no header.

Isso recriaria a divisão que está sendo removida.

---

# 17. Card principal de autenticação

Desktop:

```text
max-width: 460px
```

Mobile:

```text
width: 100%
```

Padding:

```text
24px mobile
28–32px desktop
```

Radius:

```text
24px
```

Borda:

```text
1px solid rgba(255,255,255,.10)
```

Fundo:

seguir surface/glass já existente do design system.

Não criar um estilo visual desconectado da landing.

---

# 18. Título do card

Texto:

```text
Continue no ryvano
```

Subtítulo:

```text
Entre ou crie sua conta para acompanhar seus treinos.
```

No modo específico, pode adaptar para:

Entrar:

```text
Bem-vindo de volta
```

Cadastro:

```text
Comece a acompanhar seus treinos
```

Não duplicar dois títulos grandes simultaneamente.

---

# 19. Botão Google

Deve ser a primeira ação.

Texto:

```text
Continuar com Google
```

Altura:

```text
52px
```

Radius:

```text
16px
```

Largura:

```text
100%
```

Layout:

```text
[ Google icon ]  Continuar com Google
```

Ícone Google:

```text
18–20px
```

Gap:

```text
10–12px
```

---

# 20. Estilo do botão Google

Preferência:

```text
fundo claro/branco
texto escuro
```

ou seguir guidelines oficiais já usadas no projeto.

Não usar gradiente da marca dentro do logo do Google.

Não alterar as cores oficiais do "G" se estiver usando o ícone oficial.

---

# 21. Loading no Google

Ao clicar:

```text
Continuar com Google
```

mudar para:

```text
Conectando com Google...
```

Mostrar spinner discreto.

Desabilitar clique duplicado.

Não alterar layout do botão.

---

# 22. Divisor

Após Google:

```text
──────── ou continue com ────────
```

Texto menor:

```text
ou continue com
```

Cor baixa:

```text
foreground/45–55
```

Spacing:

```text
20–24px vertical
```

---

# 23. Segmented Control

A escolha entre:

```text
Entrar
Criar conta
```

deve existir dentro do mesmo card.

Estrutura:

```text
┌──────────────────────────────┐
│   Entrar      Criar conta    │
└──────────────────────────────┘
```

Altura:

```text
44–46px
```

Radius externo:

```text
14–16px
```

Padding:

```text
4px
```

---

# 24. Estado ativo da segmented control

Background ativo:

usar token de accent/surface forte.

Texto ativo:

```text
foreground
font-weight: 600
```

Texto inativo:

```text
foreground/55
font-weight: 500
```

Não usar borda pesada.

---

# 25. Animação da segmented control

Indicador deve deslizar.

Usar Framer Motion/Motion se já existir.

Configuração:

```ts
{
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7
}
```

Tempo perceptivo:

```text
220–280ms
```

Não desmontar a segmented control.

---

# 26. Transição entre formulários

Ao alternar modo:

## saída

```text
opacity: 1 → 0
y: 0 → 6px
```

## entrada

```text
opacity: 0 → 1
y: 6px → 0
```

Duração:

```text
180–220ms
```

Não animar todo o card.

Somente conteúdo interno.

Evitar mudança brusca de altura.

---

# 27. Modo Entrar

Título:

```text
Bem-vindo de volta
```

Texto:

```text
Entre para continuar acompanhando seus treinos e evolução.
```

Campos:

```text
E-mail
Senha
```

---

# 28. Campo de email — login

Label:

```text
E-mail
```

Placeholder:

```text
seu@email.com
```

Tipo:

```html
type="email"
autocomplete="email"
```

---

# 29. Campo de senha — login

Label:

```text
Senha
```

Placeholder:

```text
Digite sua senha
```

Tipo:

```html
type="password"
autocomplete="current-password"
```

Incluir botão mostrar/ocultar senha.

---

# 30. Recuperação de senha

Link:

```text
Esqueci minha senha
```

Posicionar:

- ao lado da label de senha;
- ou abaixo do campo alinhado à direita.

Não duplicar o link em várias posições.

Rota existente:

```text
/recuperar-senha
```

deve continuar funcionando.

---

# 31. Botão Entrar

Texto:

```text
Entrar
```

Altura:

```text
50–52px
```

Radius:

```text
16px
```

Largura:

```text
100%
```

Estado loading:

```text
Entrando...
```

---

# 32. Modo Criar conta

Título:

```text
Comece a acompanhar seus treinos
```

Texto:

```text
Crie sua conta e conecte suas atividades em poucos passos.
```

Campos recomendados:

```text
Nome
E-mail
Senha
```

---

# 33. Remover confirmação de senha

Hoje existe:

```text
Senha
Confirmar senha
```

Remover `Confirmar senha` para reduzir atrito.

A senha deve ter:

- botão mostrar/ocultar;
- validação inline;
- regra mínima visível;
- feedback imediato.

---

# 34. Campo Nome

Label:

```text
Nome
```

Placeholder:

```text
Seu nome
```

Autocomplete:

```text
name
```

Se o backend exigir nome completo, label:

```text
Nome completo
```

Não pedir CPF, telefone, endereço etc. nessa tela.

Esses dados continuam no onboarding.

---

# 35. Campo Email — cadastro

Label:

```text
E-mail
```

Placeholder:

```text
seu@email.com
```

Autocomplete:

```text
email
```

---

# 36. Campo Senha — cadastro

Label:

```text
Senha
```

Placeholder:

```text
Crie uma senha
```

Autocomplete:

```text
new-password
```

Texto auxiliar:

```text
Use pelo menos 8 caracteres.
```

Não usar apenas placeholder para comunicar regra.

---

# 37. Botão cadastro

Texto:

```text
Criar minha conta
```

Loading:

```text
Criando sua conta...
```

Após sucesso:

```text
criar sessão
→ onboarding
```

---

# 38. Tratamento de email já existente

Se usuário tentar criar conta por email já existente:

NÃO mostrar erro técnico.

Mensagem:

```text
Este e-mail já está cadastrado.
Entre na sua conta ou recupere sua senha.
```

Ações:

```text
Entrar
Recuperar senha
```

Opcionalmente mudar automaticamente para modo Entrar mantendo email preenchido.

Essa é uma boa experiência.

---

# 39. Transição automática em email existente

Se backend retornar algo como:

```text
ACCOUNT_ALREADY_EXISTS
```

então:

1. manter email digitado;
2. mudar tab para `Entrar`;
3. focar campo senha;
4. mostrar mensagem curta:

```text
Encontramos sua conta. Digite sua senha para continuar.
```

Não apagar o formulário inteiro.

---

# 40. Login com email inexistente

Evitar revelar informação sensível demais dependendo da política do projeto.

Se arquitetura permitir mensagem direta:

```text
Não encontramos uma conta com esses dados.
```

Alternativa segura:

```text
E-mail ou senha inválidos.
```

Seguir a política de segurança existente.

---

# 41. Erro de senha

Mensagem:

```text
E-mail ou senha inválidos.
```

Não expor detalhes internos.

Não usar:

```text
CredentialsSignin
```

ou códigos Auth.js.

---

# 42. Erro Google

Mensagem amigável:

```text
Não foi possível continuar com Google.
Tente novamente.
```

Se houver motivo seguro e útil:

```text
A autenticação foi cancelada.
```

Não exibir stack trace ou provider error.

---

# 43. Termos

No rodapé do card:

```text
Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
```

Links:

```text
/termos
/privacidade
```

Tamanho:

```text
12px
```

Line-height:

```text
18px
```

Centralizado ou alinhado à esquerda conforme composição.

---

# 44. Onboarding

A tela de autenticação NÃO deve listar todos os dados que serão pedidos depois.

Não mostrar texto como:

```text
CPF, telefone, altura, peso, endereço, Garmin e ativação do WhatsApp...
```

Isso aumenta percepção de esforço.

Depois da autenticação, onboarding deve ser progressivo.

---

# 45. Redirecionamento pós-autenticação

Criar uma função central.

Exemplo conceitual:

```ts
resolvePostAuthDestination(user)
```

Resultado:

```text
onboarding incompleto
→ /onboarding

onboarding completo
→ /app ou dashboard
```

Não duplicar regra no:

- Google callback;
- login;
- cadastro;
- middleware.

---

# 46. Onboarding parcialmente concluído

Se usuário já iniciou onboarding antes:

```text
→ retomar exatamente do ponto correto
```

Não reiniciar onboarding do zero.

A lógica deve usar os dados reais já persistidos.

---

# 47. Redirecionamento seguro

Se houver suporte a:

```text
callbackUrl
returnTo
next
```

validar para evitar open redirect.

Permitir apenas rotas internas válidas.

---

# 48. Estrutura de componentes recomendada

Adaptar à estrutura atual.

Exemplo:

```text
components/
  auth/
    AuthPage.tsx
    AuthCard.tsx
    AuthModeTabs.tsx
    GoogleAuthButton.tsx
    LoginForm.tsx
    RegisterForm.tsx
    PasswordField.tsx
    AuthLegal.tsx
    AuthBrandPanel.tsx
```

Não criar essa estrutura se já houver componentes equivalentes.

---

# 49. Estrutura de rotas

Preferência:

```text
app/
  entrar/
    page.tsx

  cadastro/
    page.tsx
```

`/cadastro/page.tsx` pode somente redirecionar para:

```text
/entrar?modo=cadastro
```

ou compartilhar exatamente a mesma implementação.

Não manter dois formulários duplicados.

---

# 50. Auth guard

Criar/reutilizar uma função central, por exemplo:

```text
redirectAuthenticatedUser()
```

ou equivalente já existente.

Responsabilidade:

```text
session?
user?
onboarding?
destination?
```

Não duplicar consulta ao banco desnecessariamente.

---

# 51. Server-side first

Priorizar:

```text
Server Component
→ verificar sessão
→ redirect se necessário
→ renderizar Client Auth UI somente se não autenticado
```

Exemplo conceitual:

```tsx
export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    const destination =
      await resolveUserDestination(session.user.id);

    redirect(destination);
  }

  return <AuthPage />;
}
```

Adaptar à implementação real.

---

# 52. Não confiar apenas no client

É proibido depender apenas de:

```ts
useSession()
```

para proteger redirecionamento inicial.

Client session pode complementar a experiência, mas proteção e redirect devem respeitar arquitetura server-side.

---

# 53. Google account linking

Antes de alterar lógica de OAuth:

investigar:

- modelo User;
- Account;
- Session;
- Auth.js adapter;
- Prisma schema;
- regras atuais de account linking.

Não implementar linking inseguro apenas por email sem entender comportamento existente.

Usar o fluxo suportado pela configuração do Auth.js.

---

# 54. Regra importante sobre Google

Se o usuário já possui conta por email/senha e depois usar Google com o mesmo email:

não criar usuário duplicado se a estratégia atual de account linking suportar associação segura.

Antes de alterar:

1. estudar Auth.js atual;
2. estudar adapter;
3. estudar modelo Account;
4. verificar providers;
5. verificar regras de linking.

Não improvisar.

---

# 55. Prisma

Antes de alterar banco:

verificar se já existem:

```text
User
Account
Session
VerificationToken
```

ou equivalentes.

Não criar novas tabelas se Auth.js já estiver usando seu schema padrão/customizado.

---

# 56. Campos de usuário

Não mover todos os campos de onboarding para autenticação.

Autenticação deve permanecer mínima.

Cadastro:

```text
name
email
password
```

Google:

usar dados fornecidos pelo provider quando disponíveis.

Restante:

```text
onboarding
```

---

# 57. Performance

Não carregar:

- dashboard;
- gráficos;
- bibliotecas esportivas grandes;

na tela de autenticação.

Manter bundle pequeno.

---

# 58. Background

Manter identidade visual atual do ryvano:

- aurora;
- azul petróleo;
- cyan/teal;
- blobs sutis.

Mas reduzir distração perto do formulário.

O formulário deve ser o foco.

---

# 59. Motion do background

Blobs podem continuar com animação lenta.

Não aumentar motion.

Em `prefers-reduced-motion`:

reduzir ou remover animações decorativas.

---

# 60. Inputs

Altura:

```text
48–52px
```

Radius:

```text
14–16px
```

Padding horizontal:

```text
14–16px
```

Label:

```text
13–14px
font-weight: 500–600
```

Placeholder:

menor contraste.

---

# 61. Focus

Input focado deve usar:

- borda accent;
- glow mínimo;
- contraste claro.

Exemplo:

```text
border: accent/45
box-shadow: 0 0 0 3px accent/10
```

Não usar glow forte.

---

# 62. Error state

Erro:

```text
border vermelha discreta
```

Texto:

```text
12px
```

Logo abaixo do campo.

Não usar toast para erros simples de validação de campo.

Toast pode ser usado para erro global.

---

# 63. Validation timing

Não mostrar todos os erros ao abrir a tela.

Mostrar:

- após blur;
- após submit;
- ou quando regra se torna relevante.

Não punir usuário antes da interação.

---

# 64. Password toggle

Ícone:

```text
eye
eye-off
```

Botão com:

```text
aria-label="Mostrar senha"
```

ou:

```text
aria-label="Ocultar senha"
```

Área clicável mínima:

```text
40×40px
```

---

# 65. Teclado mobile

Email:

```text
inputMode="email"
```

Evitar zoom automático em iOS:

inputs devem ter pelo menos:

```text
16px
```

de font-size em mobile, ou outra solução compatível.

---

# 66. Autofill

Usar autocomplete correto.

Login:

```text
email
current-password
```

Cadastro:

```text
name
email
new-password
```

Isso melhora conversão.

---

# 67. Enter key

Login:

pressionar Enter no campo senha deve enviar.

Cadastro:

Enter na senha deve enviar quando formulário válido.

---

# 68. Loading

Durante envio:

- desabilitar botão;
- manter largura;
- spinner;
- alterar label;
- bloquear submissão duplicada.

Não congelar a tela inteira.

---

# 69. Feedback após sucesso

Não mostrar modal como:

```text
Login realizado com sucesso
```

se imediatamente haverá redirect.

Redirecionar diretamente.

Pode mostrar estado curto:

```text
Entrando...
```

se necessário.

---

# 70. Acessibilidade

Garantir:

- labels reais;
- `aria-invalid`;
- `aria-describedby`;
- foco visível;
- tab order correto;
- botão Google acessível;
- segmented control acessível;
- teclado;
- leitores de tela.

---

# 71. Segmented control acessível

Pode usar:

```text
role="tablist"
role="tab"
```

ou botões normais com:

```text
aria-pressed
```

Escolher a semântica correta conforme implementação.

---

# 72. Reduced motion

Usar:

```text
prefers-reduced-motion
```

Ao reduzir motion:

- remover spring;
- usar fade curto;
- sem y/scale extra.

---

# 73. Estados possíveis

A tela deve considerar:

```text
checking-session
unauthenticated
authenticating-google
login
register
submitting-login
submitting-register
auth-error
```

Não deixar estado ambíguo.

---

# 74. Erros de rede

Mensagem:

```text
Não foi possível conectar agora.
Verifique sua conexão e tente novamente.
```

Botão permanece disponível após erro.

---

# 75. Rotas antigas

Links existentes para:

```text
/cadastro
```

não devem quebrar.

Podem continuar apontando para `/cadastro`, desde que essa rota entre no modo correto da nova experiência.

Ao longo do projeto, preferir futuramente apontar para:

```text
/entrar?modo=cadastro
```

ou helper central equivalente.

---

# 76. Links da landing

Onde hoje existe:

```text
Criar conta
Entrar
```

pode manter ambos os CTAs.

Mas ambos devem abrir a mesma experiência.

Exemplo:

```text
Criar conta
→ /entrar?modo=cadastro

Entrar
→ /entrar
```

---

# 77. Google desde a landing

Opcionalmente, futuramente pode existir Google direto em modal/CTA.

Não implementar agora sem necessidade.

Primeiro centralizar a experiência em AuthPage.

---

# 78. Analytics

Se o projeto já possuir analytics, registrar:

```text
auth_view
auth_mode_change
auth_google_click
auth_login_submit
auth_register_submit
auth_login_success
auth_register_success
auth_google_success
auth_error
```

Não criar tracking novo se o projeto não usa analytics.

Não enviar senha/email bruto para analytics.

---

# 79. Segurança

Não armazenar senha no client.

Não logar senha.

Não colocar credenciais em query string.

Não expor mensagens internas de Auth.js.

Não expor stack trace.

---

# 80. Rate limiting

Verificar se login/cadastro já possui proteção.

Se existir, preservar.

Se não existir, não implementar uma arquitetura nova sem estudar backend.

Mas registrar como gap caso necessário.

---

# 81. CSRF

Preservar mecanismos existentes do Auth.js.

Não contornar CSRF para simplificar formulário.

---

# 82. Redirect loop

Validar:

```text
/entrar
→ sessão
→ dashboard
```

não pode voltar para `/entrar`.

Validar também:

```text
/onboarding
→ sessão
→ onboarding
```

sem loop.

---

# 83. Logout

Após logout:

```text
→ /entrar
```

ou landing, conforme comportamento atual.

Sessão deve ser realmente invalidada.

---

# 84. Conta Google recém-criada

Após primeiro Google login:

- criar user;
- criar/linkar Account;
- criar session;
- determinar onboarding;
- redirect.

Não pedir:

```text
crie uma senha
```

imediatamente.

Conta Google não precisa ter senha local obrigatória.

---

# 85. Conta por senha

Não forçar Google.

Google é opção prioritária, não obrigatória.

O usuário pode continuar por email e senha.

---

# 86. Texto final sugerido — desktop

## Coluna esquerda

```text
ryvano

Seus treinos, todos em um só lugar.

Corrida, ciclismo, natação e triathlon com atividades,
evolução e relatórios fáceis de acompanhar.
```

---

# 87. Texto final sugerido — card

```text
Continue no ryvano

Entre ou crie sua conta para acompanhar seus treinos.
```

Botão:

```text
Continuar com Google
```

Divisor:

```text
ou continue com
```

Tabs:

```text
Entrar
Criar conta
```

---

# 88. Copy login

```text
Bem-vindo de volta

Entre para continuar acompanhando seus treinos e evolução.
```

Campos:

```text
E-mail
Senha
```

Link:

```text
Esqueci minha senha
```

Botão:

```text
Entrar
```

---

# 89. Copy cadastro

```text
Comece a acompanhar seus treinos

Crie sua conta e conecte suas atividades em poucos passos.
```

Campos:

```text
Nome
E-mail
Senha
```

Auxiliar:

```text
Use pelo menos 8 caracteres.
```

Botão:

```text
Criar minha conta
```

---

# 90. Legal

```text
Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
```

---

# 91. Critérios de aceite — arquitetura

- [ ] existe uma única implementação visual de autenticação;
- [ ] `/entrar` usa AuthPage;
- [ ] `/cadastro` reutiliza a mesma experiência;
- [ ] não existem dois formulários independentes duplicados;
- [ ] Google é um único fluxo;
- [ ] cadastro cria sessão;
- [ ] sessão válida redireciona antes do formulário;
- [ ] onboarding incompleto é retomado;
- [ ] Google existente faz login;
- [ ] Google novo cria usuário;
- [ ] login existente não cria usuário duplicado.

---

# 92. Critérios de aceite — UI

- [ ] Google aparece acima das tabs;
- [ ] existe segmented control Entrar/Criar conta;
- [ ] animação de tab funciona;
- [ ] card não desmonta na troca;
- [ ] não existe bottom navigation pública/autenticada nessa tela;
- [ ] mobile é compacto;
- [ ] desktop usa duas colunas;
- [ ] formulário é o principal foco visual.

---

# 93. Critérios de aceite — copy

- [ ] remover "Auth.js" da interface;
- [ ] remover "OAuth configurado no ambiente";
- [ ] remover "Primeira etapa reduzida";
- [ ] remover lista completa de dados do onboarding;
- [ ] remover linguagem técnica;
- [ ] usar "Continuar com Google";
- [ ] usar "Bem-vindo de volta";
- [ ] usar "Comece a acompanhar seus treinos";
- [ ] termos e privacidade visíveis.

---

# 94. Critérios de aceite — cadastro

- [ ] Nome;
- [ ] E-mail;
- [ ] Senha;
- [ ] sem Confirmar senha;
- [ ] validação inline;
- [ ] mostrar/ocultar senha;
- [ ] cadastro cria sessão;
- [ ] redireciona direto ao onboarding.

---

# 95. Critérios de aceite — login

- [ ] E-mail;
- [ ] Senha;
- [ ] Esqueci minha senha;
- [ ] autocomplete;
- [ ] Enter envia;
- [ ] erro amigável;
- [ ] sem exposição de erro Auth.js.

---

# 96. Critérios de aceite — sessão

- [ ] abrir `/entrar` autenticado → redirect;
- [ ] abrir `/cadastro` autenticado → redirect;
- [ ] usuário completo → dashboard;
- [ ] usuário incompleto → onboarding;
- [ ] sessão expirada → AuthPage;
- [ ] sem flash do formulário antes do redirect.

---

# 97. Critérios de aceite — Google

- [ ] botão "Continuar com Google";
- [ ] usuário novo é criado;
- [ ] usuário existente é recuperado;
- [ ] sessão é criada;
- [ ] onboarding define destino;
- [ ] account linking respeita Auth.js existente;
- [ ] sem duplicação de usuário;
- [ ] sem criação de senha obrigatória para conta Google.

---

# 98. Critérios de aceite — mobile

- [ ] sem bottom nav;
- [ ] sem overflow horizontal;
- [ ] botão Google 100%;
- [ ] formulário 100%;
- [ ] tabs cabem;
- [ ] inputs não causam zoom indesejado;
- [ ] teclado correto para email;
- [ ] conteúdo não fica escondido por safe-area.

---

# 99. Testes obrigatórios

Testar pelo menos:

## Cenário 1

Usuário novo → cadastro email/senha → sessão → onboarding.

## Cenário 2

Usuário existente → login email/senha → dashboard.

## Cenário 3

Usuário existente → senha errada → mensagem amigável.

## Cenário 4

Usuário novo → Google → criar usuário → onboarding.

## Cenário 5

Usuário existente Google → Google → dashboard.

## Cenário 6

Usuário com onboarding incompleto → login → retomar onboarding.

## Cenário 7

Usuário já autenticado → `/entrar` → redirect sem mostrar formulário.

## Cenário 8

Usuário já autenticado → `/cadastro` → redirect sem mostrar formulário.

## Cenário 9

Email já cadastrado → tentar criar conta → orientar para Entrar.

## Cenário 10

Logout → abrir `/entrar` → formulário visível.

---

# 100. Processo de implementação

Antes de alterar:

1. estudar Auth.js atual;
2. estudar Prisma schema;
3. localizar providers;
4. localizar callbacks;
5. localizar adapters;
6. localizar sessão;
7. localizar fluxo de onboarding;
8. localizar redirects atuais;
9. localizar componentes de formulário;
10. localizar validações;
11. localizar recuperação de senha;
12. localizar componentes visuais reutilizáveis.

Depois:

1. criar experiência única;
2. unificar Google;
3. unificar login/cadastro;
4. ajustar sessão;
5. ajustar redirect;
6. ajustar `/cadastro`;
7. ajustar landing links;
8. validar mobile;
9. validar desktop;
10. validar estados e erros.

---

# 101. Não fazer

NÃO:

- criar uma terceira implementação de autenticação;
- duplicar formulários;
- manter login e cadastro separados visualmente;
- exigir login após cadastro;
- exigir cadastro após Google;
- pedir confirmar senha;
- expor Auth.js;
- expor OAuth/env;
- listar onboarding inteiro;
- mostrar bottom nav nessa tela;
- criar usuário duplicado;
- fazer account linking inseguro;
- depender apenas de `useSession`;
- renderizar formulário antes de verificar sessão se puder evitar;
- alterar schema sem necessidade.

---

# 102. Resultado final esperado

A experiência deve funcionar assim:

```text
Usuário abre ryvano
        ↓
já autenticado?
   ↙           ↘
 SIM           NÃO
 ↓              ↓
destino      AuthPage
correto         ↓
           Continuar com Google
              OU
          Entrar / Criar conta
                ↓
             sessão
                ↓
       onboarding completo?
          ↙            ↘
        SIM            NÃO
         ↓              ↓
     dashboard       onboarding
```

O usuário não deve mais sentir que existem "duas páginas diferentes" para fazer praticamente a mesma coisa.

A experiência deve comunicar:

> "Continue no ryvano."

O sistema decide internamente se precisa:

- entrar;
- criar usuário;
- retomar sessão;
- continuar onboarding.

A interface deve pedir ao usuário apenas o mínimo necessário.

# Redesign — Tela de Perfil | RYVANO

## Objetivo

Redesenhar a tela `/app/perfil` da RYVANO para deixá-la mais clara, moderna, premium e orientada ao usuário.

A tela deve transmitir a sensação de **perfil de um atleta conectado**, e não de um formulário administrativo.

> **Regra principal:** não alterar a sidebar e não alterar o header global. O redesign deve ser aplicado somente ao conteúdo central da página.

---

# 1. Problemas identificados na tela atual

A página atual mistura muitas responsabilidades diferentes dentro de uma única tela:

- dados pessoais;
- dados físicos;
- endereço;
- confirmação de WhatsApp;
- resumo dos próprios dados;
- alteração de senha;
- tema visual;
- preferências de mensagens;
- relatórios automáticos;
- horário e timezone.

Isso aumenta a densidade visual e dificulta identificar o que realmente pertence ao **Perfil**.

## 1.1. Informações duplicadas

Hoje existe um formulário com nome, e-mail, CPF, telefone, altura, peso, CEP, número e complemento. Logo ao lado existe um bloco **“Resumo rápido”** mostrando novamente nome, e-mail, telefone, altura e peso.

**Remover o bloco `Resumo rápido`.** O usuário não precisa visualizar duas vezes a mesma informação na mesma tela.

## 1.2. Endereço ocupa espaço demais

O bloco atual **“Endereço atual”** mostra CEP, logradouro, número, complemento, bairro, cidade, UF e país em cards separados.

Visualmente são muitos cards para representar uma única informação: **um endereço**.

A nova versão deve apresentar o endereço de forma compacta:

```text
Rua Pequiá, 04
Feu Rosa · Serra — ES
CEP 29172-009 · Brasil
```

## 1.3. Segurança está duplicada

A navegação lateral já possui uma seção específica `Segurança`, mas a tela Perfil também apresenta o formulário completo de alteração de senha.

**Alteração proposta:** remover o formulário de senha da tela Perfil e substituí-lo por um card de atalho:

```text
Segurança da conta
Gerencie sua senha e sessões conectadas.

[Gerenciar segurança →]
```

Destino: `/app/seguranca`.

## 1.4. Preferências de relatórios também estão duplicadas

A aplicação já possui a área `Relatórios`, mas o Perfil apresenta novamente mensageria, relatório pós-atividade, resumo diário, resumo semanal, horário e timezone.

Remover esse formulário do Perfil e mostrar somente um resumo do estado:

```text
Relatórios e notificações

Pós-treino      Ativado
Resumo diário   Desativado
Resumo semanal  Desativado

[Configurar relatórios →]
```

Destino: `/app/relatorios`.

## 1.5. Timezone técnico demais

Não exibir um campo cru como:

```text
Timezone
[ UTC ]
```

Quando essa configuração aparecer na área de Relatórios, utilizar um seletor amigável:

```text
Fuso horário
Brasília
UTC−03:00
```

Valor interno sugerido: `America/Sao_Paulo`.

---

# 2. Nova arquitetura da página

```text
┌─────────────────────────────────────────────────────────────┐
│ HERO DO PERFIL                                              │
│ Avatar  Nome do usuário              WhatsApp verificado ✓ │
│         Perfil de atleta                                    │
│         Cadastro 85% completo                              │
└─────────────────────────────────────────────────────────────┘

┌────────────────────────────────────┬────────────────────────┐
│ INFORMAÇÕES PESSOAIS               │ SUA CONTA              │
│ Nome completo                      │ WhatsApp       ✓       │
│ E-mail                             │ Garmin         ✓ / !   │
│ CPF                                │ Perfil         85%     │
│ Telefone                           │                        │
│ [Salvar alterações]                │ Segurança              │
│                                    │ [Gerenciar →]          │
├────────────────────────────────────┤                        │
│ DADOS DO ATLETA                    │ Relatórios             │
│ Altura             Peso            │ [Configurar →]         │
├────────────────────────────────────┤                        │
│ ENDEREÇO                           │                        │
│ CEP              Número            │                        │
│ Complemento                        │                        │
│ Rua / Bairro / Cidade / UF         │                        │
└────────────────────────────────────┴────────────────────────┘
```

Desktop recomendado:

```css
grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.5fr);
```

A coluna principal contém as informações editáveis. A coluna lateral contém **estado da conta e atalhos**, não dados duplicados.

---

# 3. Hero — Perfil do atleta

Adicionar um bloco introdutório antes dos formulários.

### Eyebrow

`SEU PERFIL`

### Avatar

Utilizar a foto já existente do usuário.

- desktop: `72px × 72px`;
- mobile: `60px × 60px`.

### Nome

Exibir o nome com mais peso visual.

### Subtexto

`Mantenha seus dados atualizados para personalizar suas análises e relatórios.`

### Status

Mostrar chips compactos:

- `✓ WhatsApp verificado`;
- `✓ Garmin conectado`;
- `! Garmin precisa de atenção`, quando houver problema.

Nunca mostrar mensagens técnicas no hero.

---

# 4. Indicador de completude do perfil

Adicionar uma pequena métrica:

```text
Perfil
85% completo

████████████████░░░
```

Campos possíveis para cálculo:

- nome;
- e-mail;
- telefone;
- altura;
- peso;
- CEP/endereço;
- WhatsApp verificado.

Quando atingir 100%, substituir por:

`✓ Perfil completo`

Não continuar exibindo uma barra sem necessidade.

---

# 5. Informações pessoais

Criar um card principal chamado:

## Informações pessoais

Descrição:

`Dados principais vinculados à sua conta RYVANO.`

### Nome completo

Campo editável normal.

### E-mail

Se continuar readonly, não deve parecer um input editável quebrado.

Preferir:

```text
E-mail da conta
✉ s••••••@gmail.com
  Vinculado ao login
```

Opcional: ação `Ver e-mail`.

---

# 6. CPF e telefone protegidos

A linguagem atual é administrativa demais. Evitar frases como:

`Bloqueado para evitar troca indevida. Correção só com admin.`

Usar:

```text
CPF
•••.•••.170-••
Este dado é protegido.
[Solicitar alteração]
```

Se não houver fluxo próprio:

`Este dado é protegido. Entre em contato com o suporte caso precise alterá-lo.`

Para telefone:

```text
Telefone
(27) 99980-8088
✓ WhatsApp verificado
```

A verificação de WhatsApp deve estar próxima ao telefone.

---

# 7. Dados do atleta

Altura e peso devem ficar em uma seção separada, pois são informações relevantes ao contexto esportivo.

## Dados do atleta

Descrição:

`Informações utilizadas para contextualizar suas métricas e análises.`

Layout:

```text
┌────────────────────┐ ┌────────────────────┐
│ ALTURA             │ │ PESO               │
│ 173           cm   │ │ 79,0          kg   │
└────────────────────┘ └────────────────────┘
```

O valor deve ter maior peso visual, com a unidade em tamanho menor.

### Importante

Não calcular ou destacar automaticamente IMC, peso ideal ou interpretações médicas apenas com altura e peso.

---

# 8. Endereço

Criar uma seção única:

## Endereço

Descrição:

`Informe seu CEP e complete os dados necessários.`

## CEP com busca automática

```text
CEP
[29172-009]  ✓ Endereço encontrado
```

Ao terminar um CEP válido:

1. mostrar loading discreto;
2. buscar endereço;
3. preencher os dados;
4. exibir feedback visual.

Estados:

- `Buscando endereço...`
- `✓ Endereço encontrado`
- `Não encontramos este CEP. Confira os números e tente novamente.`

Nunca mostrar erro técnico da API.

## Preview compacto

```text
ENDEREÇO ENCONTRADO

Rua Pequiá, 04
Feu Rosa · Serra — ES
CEP 29172-009 · Brasil
```

Não criar oito cards individuais.

## Número e complemento

```text
Número                         Complemento
[04                  ]         [Opcional             ]
```

Se complemento estiver vazio, simplesmente omitir do endereço final.

---

# 9. Ações do formulário

Substituir `Salvar dados do perfil` por:

`Salvar alterações`

### Sem alterações

Botão disabled.

### Com alterações

Mostrar discretamente:

`Alterações não salvas`

Adicionar `Descartar` somente quando existirem mudanças.

### Salvando

`Salvando...`

### Sucesso

Toast:

`Perfil atualizado com sucesso.`

### Erro

Toast:

`Não foi possível salvar suas alterações. Tente novamente.`

Nunca expor stack trace, HTTP status ou código interno.

---

# 10. Card lateral — Sua conta

Criar um card de estado, sem repetir dados do formulário:

```text
Sua conta

WhatsApp
● Verificado

Garmin
● Conectado

Cadastro
85% completo
```

Estados visuais:

- conectado/verificado: `CheckCircle`, emerald;
- atenção: `AlertTriangle`, amber;
- desconectado: `CircleOff`, neutro.

Não depender somente de cor: sempre mostrar ícone + texto.

---

# 11. Card lateral — Segurança

```text
Segurança

Gerencie senha, sessões e acesso à sua conta.

[Gerenciar segurança →]
```

Link: `/app/seguranca`.

Não manter o formulário de troca de senha dentro do Perfil.

---

# 12. Card lateral — Relatórios

```text
Relatórios e notificações

Pós-treino       Ativado
Resumo diário    Desativado
Resumo semanal   Desativado

[Configurar relatórios →]
```

Link: `/app/relatorios`.

---

# 13. Tema visual

A configuração de tema já existe no header.

**Não repetir um card inteiro de `Tema visual` dentro do Perfil.**

O controle de tema deve permanecer somente no header global.

---

# 14. Hierarquia visual

Aplicar três níveis claros.

### Nível 1 — Identidade

Hero do perfil.

### Nível 2 — Dados editáveis

- informações pessoais;
- dados do atleta;
- endereço.

### Nível 3 — Estado e atalhos

- sua conta;
- segurança;
- relatórios.

A tela atual usa muitos cards semelhantes e faz tudo parecer igualmente importante. O redesign deve resolver isso.

---

# 15. Estilo visual

Preservar a linguagem visual da RYVANO:

- glass;
- superfícies translúcidas;
- gradientes discretos;
- cantos arredondados;
- suporte a dark/light mode.

Evitar excesso de **caixas dentro de caixas**.

### Card principal

```text
rounded-[24px]
border border-white/10
bg-white/[0.045]
backdrop-blur
```

Padding:

- desktop: `24px`;
- mobile: `18px`.

---

# 16. Inputs

Altura recomendada: `48px – 52px`.

Border radius: `16px`.

### Normal

- fundo translúcido;
- borda discreta.

### Hover

- borda um pouco mais visível.

### Focus

- ring cyan/azul da identidade RYVANO;
- glow leve.

### Erro

- borda rose/red;
- mensagem curta abaixo.

### Sucesso

- pequeno ícone check;
- não pintar o input inteiro de verde.

---

# 17. Campos somente leitura

Campos readonly devem ter aparência própria.

Exemplo:

```text
E-mail
✉ s••••••@gmail.com
  Vinculado ao login
```

Usar background neutro e não dar aparência de campo editável.

---

# 18. Ícones

Utilizar a biblioteca já presente no projeto.

Sugestões:

- `User`
- `Mail`
- `Phone`
- `BadgeCheck`
- `Ruler`
- `Scale`
- `MapPin`
- `ShieldCheck`
- `Bell`
- `Watch`
- `ChevronRight`
- `CheckCircle2`
- `AlertTriangle`

Não utilizar emojis reais na interface final.

---

# 19. Motion

Usar `motion` / `framer-motion` de forma discreta.

## Entrada da página

```tsx
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
transition={{ duration: 0.25 }}
```

Cards:

```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
```

Container:

```tsx
staggerChildren: 0.05
```

## Cards clicáveis

```tsx
whileHover={{ y: -2, scale: 1.005 }}
```

Duração: `150–180ms`.

## Botões

```tsx
whileHover={{ scale: 1.015 }}
whileTap={{ scale: 0.985 }}
```

## Barra de completude

```tsx
initial={{ width: 0 }}
animate={{ width: `${completion}%` }}
transition={{
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1]
}}
```

## Atualização do endereço

Usar `AnimatePresence`:

```tsx
initial={{ opacity: 0, y: 6 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -4 }}
```

## Reduced motion

Respeitar `prefers-reduced-motion`.

---

# 20. Responsividade

## Desktop — acima de 1280px

```text
Hero
↓
Main 70% | Coluna lateral 30%
```

Main:

- Informações pessoais;
- Dados do atleta;
- Endereço.

Lateral:

- Sua conta;
- Segurança;
- Relatórios.

## Tablet

- hero full width;
- informações pessoais full width;
- dados do atleta em duas colunas;
- endereço full width;
- cards laterais em grid.

## Mobile

```text
Hero
↓
Informações pessoais
↓
Dados do atleta
↓
Endereço
↓
Sua conta
↓
Segurança
↓
Relatórios
```

Não utilizar duas colunas estreitas para inputs importantes.

---

# 21. Proteção de informações pessoais

Evitar deixar CPF, telefone e e-mail totalmente expostos sem necessidade.

Recomendação:

```text
CPF      •••.•••.170-••
Telefone (27) •••••-8088
E-mail   s••••••@gmail.com
```

Opcionalmente permitir revelar o dado quando necessário.

Isso é especialmente útil em telas compartilhadas.

---

# 22. Textos recomendados

## Hero

**Título:** `Seu perfil`

**Descrição:** `Mantenha seus dados atualizados para receber análises e relatórios mais personalizados.`

## Informações pessoais

**Título:** `Informações pessoais`

**Descrição:** `Dados principais vinculados à sua conta RYVANO.`

## Dados do atleta

**Título:** `Dados do atleta`

**Descrição:** `Informações utilizadas para contextualizar suas métricas.`

## Endereço

**Título:** `Endereço`

**Descrição:** `Informe seu CEP e complete os dados necessários.`

## Segurança

**Descrição:** `Gerencie senha e acesso à sua conta.`

## Relatórios

**Descrição:** `Configure quando e como receber seus resumos.`

---

# 23. Componentização sugerida

```text
ProfilePage
├── ProfileHero
│   ├── UserAvatar
│   ├── VerificationBadges
│   └── ProfileCompletion
│
├── ProfileContentGrid
│   ├── ProfileMainColumn
│   │   ├── PersonalInfoCard
│   │   ├── AthleteDataCard
│   │   └── AddressCard
│   │
│   └── ProfileSidebar
│       ├── AccountStatusCard
│       ├── SecurityShortcutCard
│       └── ReportsShortcutCard
│
└── ProfileSaveToast
```

Componentes reutilizáveis:

```text
SectionCard
FieldLabel
EditableField
ProtectedField
StatusRow
StatusBadge
ShortcutCard
ProfileCompletion
AddressPreview
SaveButton
InlineFeedback
```

---

# 24. Estados necessários

Prever:

- loading inicial;
- perfil carregado;
- alteração não salva;
- salvando;
- salvo;
- erro ao salvar;
- buscando CEP;
- CEP encontrado;
- CEP inválido;
- erro ao consultar CEP;
- WhatsApp verificado/não verificado;
- Garmin conectado/com erro/desconectado.

### Loading

Utilizar skeleton consistente com o layout final. Não usar spinner gigante no centro da tela.

### Empty state

Se complemento estiver vazio, não mostrar `—` em um card. Apenas omitir.

Se altura/peso estiverem ausentes:

```text
Complete seus dados do atleta
Altura e peso ajudam a contextualizar algumas métricas.
[Completar dados]
```

---

# 25. Erros

Nunca mostrar:

- stack trace;
- mensagens de banco;
- exceptions;
- status HTTP;
- códigos internos;
- erros React.

Mensagem padrão:

`Não foi possível concluir esta ação. Tente novamente.`

Mensagem de CEP:

`Não encontramos este CEP. Confira os números informados.`

---

# 26. Cores

Manter compatibilidade com os temas claro e escuro.

### Primary

Cyan/azul RYVANO.

Uso:

- botão principal;
- focus;
- progresso;
- elementos ativos.

### Success

Emerald.

Uso:

- WhatsApp verificado;
- Garmin conectado;
- sucesso ao salvar.

### Warning

Amber.

Uso:

- integração precisando de atenção;
- cadastro incompleto quando relevante.

### Danger

Rose/red.

Uso:

- erro;
- ações destrutivas.

Não pintar cada card de uma cor diferente. Concentrar cor em ícone, badge, borda e glow suave.

---

# 27. Modo claro

Garantir contraste suficiente no tema claro.

Evitar depender apenas de `white/5` para separar superfícies.

Usar tokens semânticos do tema para:

- background;
- surface;
- border;
- muted text;
- primary;
- success;
- warning;
- danger.

---

# 28. Tipografia

- hero title: `text-2xl / text-3xl`;
- nome: `font-semibold`;
- section title: `text-lg / text-xl`;
- labels: `text-sm font-medium`;
- valores importantes: `text-lg / text-xl font-semibold`;
- descrições: `text-sm text-muted-foreground`.

---

# 29. Espaçamento

Recomendação:

- entre seções: `16px – 20px`;
- dentro dos cards: `20px – 24px`;
- label → input: `8px`;
- entre campos: `14px – 16px`.

Evitar excesso de containers aninhados.

---

# 30. Prioridade de implementação

## P0 — obrigatório

1. Não alterar sidebar.
2. Não alterar header.
3. Remover `Resumo rápido`.
4. Compactar `Endereço atual`.
5. Remover formulário de Segurança do Perfil.
6. Remover formulário de Preferências de relatórios do Perfil.
7. Criar atalhos para Segurança e Relatórios.
8. Separar dados pessoais de dados do atleta.
9. Melhorar CPF/telefone protegidos.
10. Criar feedback correto de salvamento.
11. Responsividade completa.

## P1 — recomendado

1. Hero do perfil.
2. Indicador de completude.
3. Status de WhatsApp.
4. Status de Garmin.
5. Preview automático do endereço.
6. Dirty state.
7. Skeleton.
8. Motion.

## P2 — refinamento

1. Mascaramento/revelação de dados pessoais.
2. Edição de avatar.
3. Animação da barra de completude.
4. Microfeedback visual de sucesso.
5. Atalhos inteligentes para configuração incompleta.

---

# 31. Critérios de aceite

- [ ] sidebar permanece visual e funcionalmente intacta;
- [ ] header permanece visual e funcionalmente intacto;
- [ ] `Resumo rápido` foi removido;
- [ ] dados pessoais não são apresentados de forma redundante;
- [ ] endereço está apresentado de forma compacta;
- [ ] CEP possui feedback de busca;
- [ ] altura e peso estão agrupados em `Dados do atleta`;
- [ ] CPF possui tratamento visual de dado protegido;
- [ ] telefone mostra claramente seu status de WhatsApp;
- [ ] formulário de senha não está duplicado dentro do Perfil;
- [ ] existe acesso claro para `/app/seguranca`;
- [ ] preferências de relatórios não estão duplicadas no Perfil;
- [ ] existe acesso claro para `/app/relatorios`;
- [ ] tema não está duplicado no conteúdo da página;
- [ ] timezone técnico não aparece como input de texto no Perfil;
- [ ] existe feedback de loading ao salvar;
- [ ] existe feedback de sucesso;
- [ ] existe feedback de erro;
- [ ] cards têm hierarquia visual;
- [ ] layout funciona corretamente no mobile;
- [ ] interface funciona em modo claro;
- [ ] interface funciona em modo escuro;
- [ ] animações respeitam `prefers-reduced-motion`.

---

# 32. Resultado esperado

A página deve deixar de parecer:

> formulário + endereço + resumo duplicado + senha + configurações.

E passar a parecer:

> **perfil de um atleta dentro de uma plataforma de performance.**

O usuário deve conseguir entender em poucos segundos:

1. quem está conectado;
2. se a conta está configurada;
3. quais dados pessoais estão cadastrados;
4. quais informações podem ser alteradas;
5. quais dados estão protegidos;
6. qual endereço está cadastrado;
7. se WhatsApp e Garmin estão conectados;
8. onde acessar segurança;
9. onde configurar relatórios.

A experiência final deve ser **mais limpa, mais premium, mais orientada ao usuário e visualmente coerente com Dashboard, Atividades e Integrações da RYVANO**.

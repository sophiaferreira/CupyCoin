# 🪙 CupyCoin — o guia completo

Este guia conta **tudo o que foi feito** para construir o CupyCoin: o que cada peça faz, por que foi feita assim e
como mexer nela. Foi escrito para quem está aprendendo, então os termos técnicos são explicados no caminho
(e tem um [glossário](#-glossário) no final).

**Sumário**

1. [O que é o CupyCoin](#1-o-que-é-o-cupycoin)
2. [A visão geral](#2-a-visão-geral)
3. [Linha do tempo: como o app foi construído](#3-linha-do-tempo-como-o-app-foi-construído)
4. [Parte 1 — Open Finance e Pluggy: de onde vêm os dados](#4-parte-1--open-finance-e-pluggy-de-onde-vêm-os-dados)
5. [Parte 2 — O app no seu computador](#5-parte-2--o-app-no-seu-computador)
6. [Parte 3 — Como as categorias funcionam](#6-parte-3--como-as-categorias-funcionam)
7. [Parte 4 — As telas](#7-parte-4--as-telas)
8. [Parte 5 — Segurança](#8-parte-5--segurança)
9. [Parte 6 — A AWS](#9-parte-6--a-aws)
10. [Parte 7 — Implantar, atualizar e manter](#10-parte-7--implantar-atualizar-e-manter)
11. [Problemas que apareceram e como foram resolvidos](#11-problemas-que-apareceram-e-como-foram-resolvidos)
12. [Mapa dos arquivos](#12-mapa-dos-arquivos)
13. [Glossário](#-glossário)
14. [Ideias para o futuro](#14-ideias-para-o-futuro)

---

## 1. O que é o CupyCoin

Um app pessoal de finanças que:

- **puxa sozinho** as transações dos bancos (XP e Santander) pelo **Open Finance** — sem digitar nada e sem importar extrato;
- **separa os gastos em categorias** (Restaurantes, Mercado, Transporte…) e **aprende** com as suas correções;
- **desconta** dinheiro que volta pra você (ex.: o Pix das meninas que dividem a casa sai de "Contas da casa");
- mostra seus **investimentos** (CDBs, poupança) e quanto renderam;
- roda **na AWS**, com **login por senha**, e pode ser **instalado na tela de início do iPhone**.

---

## 2. A visão geral

```
                ┌──────────────┐   Open Finance    ┌──────────────┐
  Seus bancos   │ XP, Santander│ ─────────────────►│  Meu Pluggy  │  (atualiza 1x por dia)
                └──────────────┘  (você autoriza   └──────┬───────┘
                                   no app do banco)       │ API (só leitura)
                                                          ▼
 ┌──────────────────────────────── AWS (us-east-2, Ohio) ─────────────────────────────────┐
 │                                                                                         │
 │  iPhone/navegador ──https──► Function URL ──► Lambda "cupycoin" (src/app.js)            │
 │                                                 │  ├─► S3: dados/meus-dados.json         │
 │                                                 │  ├─► Parameter Store: /cupycoin/*      │
 │                                                 │  └─► CloudWatch Logs (14 dias)         │
 │  EventBridge (todo dia 7h) ─────────────────────┘                                       │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

O **mesmo código** (`src/app.js`) roda em dois lugares:

| | No seu PC | Na AWS |
|---|---|---|
| Como abre | `iniciar.bat` → `server.js` | link `https://…lambda-url.us-east-2.on.aws` → `lambda.js` |
| Onde guarda os dados | pasta `dados/` | bucket S3 |
| Onde ficam as chaves | `configuracao.env` | Parameter Store |
| Pede senha? | Não (só funciona no próprio PC) | Sim |
| Atualiza sozinho? | Quando você abre o app | Todo dia às 7h + quando você abre |

---

## 3. Linha do tempo: como o app foi construído

1. **A ideia:** um app que controla gastos por categoria. Primeiro pensamos em lançar gastos à mão ou importar o extrato.
2. **"Quero que atualize sozinho":** pesquisamos e descobrimos o **Meu Pluggy**, que dá acesso grátis ao Open Finance para uso pessoal.
3. **Primeira versão local:** servidor em Node.js sem nenhuma biblioteca extra, dados em JSON, painel com gráficos e modo demonstração.
4. **Regras próprias:** "quando o nome tiver `maria rosa`, é Saúde" — sem diferenciar maiúsculas/minúsculas nem acentos.
5. **Conexão real:** conta no Meu Pluggy, aplicação no Dashboard, conector MeuPluggy, ids dos bancos → 1.464 transações de 12 meses.
6. **Ajustes com dados reais:** fatura contando duas vezes, Pix entre as próprias contas, iFood aparecendo como "IFD*", resgate da poupança caindo em "Contas da casa"…
7. **Descontos:** regras que valem só "quando eu RECEBER", para o Pix das colegas de casa descontar de "Contas da casa".
8. **Tela mais limpa:** a lista gigante de transações saiu; tocar numa categoria abre um painel só com ela.
9. **Investimentos:** seção nova com os CDBs; "Delivery" + "Restaurantes e lanches" viraram "Restaurantes"; seguro do carro foi para Transporte.
10. **Nome:** CupyCoin 🪙.
11. **AWS:** conta no plano gratuito, MFA, AWS CLI, `aws login`, chaves no cofre, implantação com CloudFormation.
12. **iPhone:** ícone, tela cheia, login com senha.

---

## 4. Parte 1 — Open Finance e Pluggy: de onde vêm os dados

### O que é Open Finance

É o sistema **oficial do Banco Central** que permite você autorizar um app a **ler** suas informações bancárias.
Você autoriza **dentro do app do próprio banco**, escolhe o que compartilhar e por quanto tempo (até 12 meses), e
pode cancelar quando quiser. **Ninguém vê sua senha** e **ninguém consegue movimentar dinheiro** por ali.

Apps pessoais não podem se conectar direto no Open Finance — só empresas autorizadas. Por isso usamos um
**agregador**: a **Pluggy**. Ela tem o programa **Meu Pluggy**, gratuito para ler **os seus próprios dados**:

- até **5 conexões**, todas no seu CPF;
- atualiza **sozinho a cada 24 horas**;
- traz até **12 meses de histórico** na primeira vez;
- sem uso comercial.

### Como conectamos (resumo)

1. **meu.pluggy.ai** → criar conta → "Conectar Minha Conta" → autorizar a XP e o Santander no app de cada banco.
2. **dashboard.pluggy.ai** (mesma conta) → a aplicação (que ganhou o nome "Pluggy Demo App") → copiar **Client ID** e **Client Secret** (o secret só aparece uma vez).
   - O aviso "15 dias de teste" é do lado comercial e **não** vale para o uso pessoal.
   - O código de exemplo que aparece no tutorial (connect token, Next.js) **não** é necessário para este app.
3. Na aplicação: **Conectar Conta → MeuPluggy** (não o banco, não o Sandbox) → escolher um banco por vez.
4. Copiar o **id de cada item** (o código em cima de "MeuPluggy", formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
5. Colar tudo no `configuracao.env`.

### Como o app fala com a Pluggy (`src/pluggy.js`)

| Pedido | Para quê |
|---|---|
| `POST /auth` com Client ID + Secret | Recebe uma **API key** que vale **2 horas** |
| `GET /items/{id}` | Status da conexão e **quando a autorização vence** (`consentExpiresAt`) |
| `GET /accounts?itemId=…` | Contas e cartões de cada banco |
| `GET /v2/transactions?accountId=…` | Transações, de 500 em 500, seguindo o campo `next` até acabar |
| `GET /investments?itemId=…` | Investimentos (CDBs etc.) |

A primeira atualização busca tudo. As próximas revisam só os **últimos 45 dias** (para pegar compras pendentes
que viraram confirmadas ou foram canceladas).

⚠️ **A autorização do Open Finance vale 1 ano** (a sua vence em **22/11/2027**). O app avisa 30 dias antes.
Para renovar: Dashboard → Conectar Conta → MeuPluggy de novo. Se o id do banco mudar, atualize o `ITEM_IDS`.

---

## 5. Parte 2 — O app no seu computador

- Feito em **Node.js** (JavaScript fora do navegador), **sem nenhuma biblioteca externa** — por isso não tem `npm install`.
- `iniciar.bat` → roda `node server.js` → abre o navegador em `http://localhost:3737`.
- **localhost** = "este computador". Por isso o celular não consegue abrir essa versão.
- Sem o `configuracao.env` preenchido, o app abre em **modo demonstração** com dados fictícios (`src/demo.js`).

### Como um pedido é atendido

```
navegador ──► server.js ──► src/app.js (tratar) ──► lê/salva dados ──► responde (HTML, JSON, imagem)
```

`src/app.js` não sabe se está no PC ou na AWS: quem diz é quem cria ele, passando **onde guardar os dados**
(`src/armazenamento.js`), **de onde ler a configuração** e **se precisa de login**. Essa separação é o que permitiu
levar o app para a AWS sem reescrever.

### Os dados

Tudo fica num JSON (`dados/meus-dados.json` no PC, ou no S3 na AWS) com:
`contas`, `itens` (conexões), `transacoes`, `investimentos`, `regras`, `aprendidas`, `limites`, `ultimaSincronizacao`.

Quando uma categoria muda de nome (ex.: "Delivery" → "Restaurantes"), a função `migrarCategorias` em
`src/banco.js` atualiza regras, limites e correções antigas automaticamente ao carregar.

---

## 6. Parte 3 — Como as categorias funcionam

Arquivo: `src/categorias.js`. Para cada transação, o app decide a categoria **nesta ordem**:

1. **Você mudou na mão** essa transação ("Só esta") → fica como você escolheu.
2. **Suas regras** ("Minhas regras"): se a descrição **contém** o texto da regra.
   - Não diferencia maiúsculas/minúsculas nem acentos (`MARIA ROSA` = `maria rosa` = `Maria Rósa`).
   - Pode valer só quando você **RECEBE**, só quando **PAGA/ENVIA**, ou nos dois casos.
   - Se duas regras batem, ganha a de texto mais longo.
3. **O que o app aprendeu** ("Sim, todas"): mesmo estabelecimento (a descrição sem números).
4. **Pix/TED para você mesma**: se o nome do titular da conta aparece na descrição → "Transferência entre minhas contas".
5. **Palavras-chave prontas**: uma lista em ordem (por isso "amazon prime" vem antes de "amazon", e "uber eats" antes de "uber").
6. Nada bateu → **Outros**.

### Categorias especiais

| Categoria | Como conta |
|---|---|
| Entradas, Estornos e reembolsos | Entram em "Entradas" |
| **Pagamento de fatura** | **Não conta** — as compras do cartão já foram contadas uma a uma (se o cartão não estiver conectado, vira "Cartão de crédito" e conta) |
| **Transferência entre minhas contas** | **Não conta** — dinheiro que só mudou de lugar |
| **Investimentos** 📈 | **Não conta** como gasto nem entrada; aparece na seção Investimentos (investido × resgatado) |

### Descontos (o Pix das meninas)

Se uma **entrada** cai numa categoria de **gasto** (por uma regra "quando eu RECEBER… → Contas da casa"), ela
**diminui** aquela categoria e o total de gastos, e **não** conta como entrada. É a mesma conta que você faria de cabeça:
"paguei R$ 4.200 de contas, voltaram R$ 1.400, então gastei R$ 2.800".

---

## 7. Parte 4 — As telas

Arquivos: `public/index.html`, `public/app.js`, `public/estilo.css`.

- **Topo:** resumo do mês — gastos (com comparação justa: mesmo período do mês passado), entradas, quanto sobrou, onde mais gastou.
- **Gastos por categoria:** barras; **tocar** abre um painel com as transações daquela categoria, onde dá para trocar categoria e definir limite.
- **Últimos 6 meses:** gráfico de colunas (tocar numa coluna vai para aquele mês).
- **Investimentos:** total investido, rendimento **bruto** (antes do imposto), aportes e resgates do mês.
- **Minhas regras:** criar e remover regras, com prévia de quantas transações vão mudar.
- Tema claro/escuro automático, layout de celular, e no iPhone abre em tela cheia respeitando o "notch".

O ícone (`public/icone-*.png`) é a **foto da moeda com o gatinho** (`Olhos de Gatinho com Moedas - 2.jpeg`), recortada em quadrado pelo script `ferramentas/icones-da-foto.ps1`. Para trocar a capa, coloque outra foto na pasta e rode: `powershell -ExecutionPolicy Bypass -File ferramentas\icones-da-foto.ps1 -foto "nome-da-foto.jpg"`.

---

## 8. Parte 5 — Segurança

| Risco | O que foi feito |
|---|---|
| Chaves da Pluggy vazarem | Ficam **fora do código**: `configuracao.env` (no PC) e **Parameter Store criptografado** (na AWS). O `.gitignore` impede que vão para o GitHub. |
| Dados bancários vazarem | Pasta `dados/` no `.gitignore`; bucket S3 **privado**, **criptografado** e com **bloqueio de acesso público**. |
| Alguém abrir o app pela internet | **Login com senha.** A senha nunca é guardada: só um *hash* **scrypt** (uma impressão digital difícil de reverter). |
| Alguém tentar adivinhar a senha | Depois de **5 erros seguidos**, bloqueia por **15 minutos**. |
| Roubo do "login" (cookie) | Cookie **assinado** (HMAC), `HttpOnly` (o JavaScript não lê), `Secure` (só https), `SameSite=Strict`, vale 30 dias. |
| Outro site mandar pedidos em seu nome (CSRF) | O app recusa pedidos cuja origem não é ele mesmo. |
| Código malicioso injetado na página | **Content-Security-Policy**: a página só carrega scripts do próprio app; textos dos bancos são "escapados" antes de aparecer. |
| A função na AWS fazer mais do que deve | **Menor privilégio**: o papel (IAM) do Lambda só lê/salva o arquivo de dados, lê o cofre e escreve logs. |
| Conta AWS invadida | **MFA** (verificação em duas etapas) no Builder ID; CLI com `aws login` (credenciais temporárias, sem chave permanente no PC). |
| Perder dados | **Versionamento** no S3 (30 dias de versões antigas) e `DeletionPolicy: Retain` (apagar a pilha não apaga os dados). |

**Regra de ouro:** senhas, Client Secret e códigos nunca são mandados por chat — vão direto para o arquivo ou para o terminal.

---

## 9. Parte 6 — A AWS

### Conceitos

- **Conta / projeto:** a sua conta foi criada pelo **Builder ID** (o jeito novo da AWS). Ela não tem login de "usuário raiz" por e-mail e senha.
- **Plano gratuito:** US$ 100 em créditos, até **22/05/2027**. Enquanto estiver nele, **não há cobrança no cartão**. ⚠️ Antes dessa data é preciso passar para o plano pago, senão a conta é fechada. O app foi montado para caber nas cotas **grátis para sempre** (custo esperado: perto de zero).
- **Região:** os data centers ficam em regiões. Contas do Builder ID ficam numa região fixa — a sua é **us-east-2 (Ohio)**. Se no painel "sumir tudo", confira a região no canto de cima.
- **IAM:** o sistema de permissões. Na AWS nada pode nada até receber permissão.
- **Infraestrutura como Código:** em vez de clicar em telas, descrevemos tudo num arquivo (`aws/modelo.yaml`) e o **CloudFormation** cria. Dá para recriar igual com um comando.

### As peças (a pilha `cupycoin` no CloudFormation)

| Peça (ID lógico) | Tipo | O que faz |
|---|---|---|
| `Funcao` | Lambda | **O app em si.** Só "liga" quando alguém usa; por isso é barato. Node.js 22, processador ARM (mais barato), 512 MB, até 120 s. |
| `PapelDaFuncao` | IAM Role | O **crachá** do Lambda: só pode ler/salvar dados no S3, ler o cofre e escrever logs. |
| `Logs` | CloudWatch Logs | O **diário** do Lambda (acessos, atualizações, erros), guardado por 14 dias. |
| `Endereco` | Lambda Function URL | O **link https** do app. Aberto na internet — quem pede senha é o próprio app. |
| `PermissaoEndereco`, `PermissaoEnderecoInvocar` | Lambda Permission | Autorizam o link a acordar o Lambda (a AWS exige as duas desde out/2025). |
| `BucketDados` | S3 | O **HD na nuvem** com o arquivo de dados. Privado, criptografado, com versões. |
| `AtualizacaoDiaria` | EventBridge Rule | O **despertador**: todo dia às 7h (10h UTC) manda o Lambda buscar novidades na Pluggy. |
| `PermissaoAtualizacao` | Lambda Permission | Autoriza o despertador a acordar o Lambda. |

**Fora da pilha** (criados pelos scripts):
- **Parameter Store** `/cupycoin/…`: `CLIENT_ID`, `CLIENT_SECRET` 🔒, `ITEM_IDS`, `SEGREDO_SESSAO` 🔒, `SENHA_HASH` 🔒. Ficam fora da receita de propósito, para segredos nunca estarem escritos nela.
- **Bucket de pacotes** `cupycoin-pacotes-…`: onde o script deixa o código empacotado para o Lambda.

### O caminho de um acesso

Você abre o link → **Endereco** → as **Permissões** deixam passar → **Funcao** acorda (com o crachá **PapelDaFuncao**)
→ lê a configuração no **Parameter Store** → confere o cookie de login → lê seus dados no **BucketDados**
→ anota no **Logs** → devolve a tela.

### Por que essa arquitetura (e não outra)

O plano inicial tinha S3 + CloudFront para as telas, API separada e banco DynamoDB. Simplificamos para **um Lambda
que serve tudo** + **um arquivo JSON no S3**, porque:
- é muito menos coisa para configurar e entender;
- o app tem um único usuário, então um arquivo JSON dá conta;
- reaproveita o mesmo código da versão local;
- continua dentro das cotas grátis.

Desvantagem: o link é feio (`…lambda-url.us-east-2.on.aws`). Um domínio próprio exigiria CloudFront + comprar um domínio.

---

## 10. Parte 7 — Implantar, atualizar e manter

Pré-requisitos: **Node.js** e **AWS CLI 2.32+** (`winget install -e --id Amazon.AWSCLI`).

```powershell
# 1. Entrar na AWS pelo terminal (vale até 12 h)
aws login --region us-east-2
#    → antes, entre com o Builder ID no navegador padrão (settings.aws.com)
#    → se aparecer "IAM user sign in", clique em "Change to new experience"
#    → no terminal, se perguntar a região, aperte Enter (us-east-2)

# 2. Mandar as chaves da Pluggy para o cofre (lê o configuracao.env, não mostra nada)
node aws/enviar-chaves.js

# 3. Criar/trocar a senha do app (no seu terminal; a senha não aparece)
node aws/definir-senha.js

# 4. Implantar (ou atualizar depois de mudar o código)
node aws/implantar.js
```

O `implantar.js`:
1. junta só o necessário (`lambda.js`, `src/`, `public/`) numa pasta temporária — **nunca** o `configuracao.env` nem `dados/`;
2. cria (uma vez) o bucket de pacotes;
3. `aws cloudformation package` (envia o código) + `aws cloudformation deploy` (cria/atualiza a pilha);
4. na primeira vez, envia o seu `dados/meus-dados.json` para o S3;
5. mostra o endereço do app.

**No iPhone:** abrir o link no Safari → Compartilhar → **Adicionar à Tela de Início**.

### Manutenção

| Situação | O que fazer |
|---|---|
| Mudou o código | `node aws/implantar.js` |
| Esqueceu/quer trocar a senha | `node aws/definir-senha.js` |
| Renovou o Open Finance e o id mudou | Atualize `ITEM_IDS` no `configuracao.env` → `node aws/enviar-chaves.js` |
| Algo deu errado no app | Painel da AWS → Lambda → `cupycoin` → Monitorar → Logs |
| `aws` diz que não está logada | `aws login --region us-east-2` |
| 📅 Antes de 22/05/2027 | Faturamento → passar para o plano pago |
| 📅 Antes de 22/11/2027 | Renovar a autorização no Meu Pluggy |

> Os dados da AWS e os do PC são **independentes** desde a implantação. Use a versão da AWS no dia a dia; a do PC serve para testar mudanças.

---

## 11. Problemas que apareceram e como foram resolvidos

Esses foram os momentos de "por que não funciona?" — e o que cada um ensinou.

| Problema | Causa | Solução | Lição |
|---|---|---|---|
| Gastos altos demais | O pagamento da fatura do Santander ("PAGAMENTO CARTAO CREDITO") contava como gasto, além das compras do cartão | Palavras-chave de fatura → categoria que não conta | Sempre confira os números com dados reais |
| Pix para mim mesma como gasto **e** entrada | Transferências XP ↔ Santander | Detectar o nome do titular da conta na descrição | Dinheiro que muda de lugar não é gasto |
| iFood em "Outros" | Aparece como `IFD*NOME DO LUGAR` | Palavra-chave ` ifd ` | Cada banco escreve de um jeito |
| Resgate da poupança em "Contas da casa" | A descrição tinha "INTERNET" (de "central/internet/app") | Regras de investimento antes das de casa | A ordem das regras importa |
| `aws` "não encontrado" | CLI não instalado | `winget install Amazon.AWSCLI` | — |
| Tela "IAM user sign in" e "conta não existe" | Conta do Builder ID não tem login de usuário raiz; navegador padrão não estava logado | Entrar com Builder ID no navegador padrão + "Change to new experience" | Contas novas da AWS usam outro login |
| Login no navegador deu certo, mas o CLI não tinha credenciais | O terminal estava esperando a pergunta "AWS Region [us-east-2]:" | Apertar Enter | Leia o que o terminal está perguntando |
| Região | O app estava preparado para São Paulo, mas contas do Builder ID ficam numa região fixa | Trocar para us-east-2 | — |
| O script de implantar morria sem erro | `fs.cpSync` do Node trava no Windows em pastas com acento ("Área de Trabalho") | Cópia de pastas feita "na mão" | Acentos em caminhos ainda dão problema em várias ferramentas |

---

## 12. Mapa dos arquivos

```
app-financas/
├── GUIA.md                  ← este guia
├── LEIA-ME.md               ← como usar o app no dia a dia
├── iniciar.bat              ← abre a versão do PC (dois cliques)
├── server.js                ← versão do PC (servidor local)
├── lambda.js                ← versão da AWS (entrada do Lambda)
├── configuracao.env         ← SUAS chaves (não vai pro GitHub)
├── configuracao.env.exemplo ← modelo do arquivo acima
├── .gitignore               ← o que o Git ignora (chaves e dados)
├── src/
│   ├── app.js               ← o "coração": rotas, login, respostas
│   ├── pluggy.js            ← conversa com a API da Pluggy
│   ├── sincronizar.js       ← busca novidades e junta com o que existe
│   ├── categorias.js        ← categorias, palavras-chave e regras
│   ├── banco.js             ← configuração local e arquivo de dados
│   ├── armazenamento.js     ← guardar dados no PC ou no S3
│   ├── autenticacao.js      ← senha (scrypt), cookie, bloqueio
│   └── demo.js              ← dados fictícios do modo demonstração
├── public/                  ← o que aparece no navegador
│   ├── index.html, app.js, estilo.css
│   ├── entrar.html, entrar.js   ← tela de login
│   ├── manifest.webmanifest     ← "instalar" como app
│   └── icone-180/192/512.png
├── aws/
│   ├── modelo.yaml          ← a receita do CloudFormation
│   ├── implantar.js         ← manda o app para a AWS
│   ├── enviar-chaves.js     ← chaves da Pluggy → Parameter Store
│   ├── definir-senha.js     ← cria/troca a senha do app
│   ├── comum.js             ← funções usadas pelos scripts
│   └── LEIA-ME-AWS.md       ← passo a passo da AWS
├── ferramentas/
│   └── icones-da-foto.ps1   ← transforma a foto da capa nos ícones
└── dados/                   ← seus dados no PC (não vai pro GitHub)
```

---

## 📖 Glossário

| Termo | O que é |
|---|---|
| **API** | Um "balcão de atendimento" de um sistema: você faz um pedido num formato combinado e recebe uma resposta. |
| **API key** | Uma senha temporária para usar uma API. |
| **Agregador** | Empresa autorizada a se conectar no Open Finance e repassar os dados (a Pluggy). |
| **Bucket** | Uma "pasta principal" no S3. |
| **CLI** | Programa usado pelo terminal, com comandos de texto (o AWS CLI). |
| **CloudFormation** | Serviço da AWS que cria tudo a partir de uma receita (arquivo YAML). |
| **Cookie** | Um "crachá" que o site guarda no navegador para lembrar que você fez login. |
| **CSRF** | Ataque em que outro site tenta mandar pedidos usando o seu login. |
| **Function URL** | Um link https que chama direto uma função Lambda. |
| **Hash** | Uma "impressão digital" de um texto, que não dá para desfazer. Guardamos o hash da senha, nunca a senha. |
| **IAM** | Sistema de permissões da AWS ("quem pode fazer o quê"). |
| **Infraestrutura como Código** | Descrever servidores/serviços num arquivo em vez de clicar em telas. |
| **JSON** | Formato de texto para guardar dados organizados (`{ "nome": "valor" }`). |
| **Lambda** | Serviço da AWS que roda o seu código só quando é chamado ("serverless"). |
| **localhost** | "Este computador". |
| **MFA** | Verificação em duas etapas (senha + código no celular). |
| **Node.js** | Programa que roda JavaScript fora do navegador. |
| **Open Finance** | Sistema do Banco Central para compartilhar dados bancários com autorização. |
| **Parameter Store** | Cofre da AWS para configurações e segredos. |
| **PWA** | Site que pode ser "instalado" como app na tela de início. |
| **Região** | Conjunto de data centers da AWS num lugar do mundo (us-east-2 = Ohio). |
| **S3** | Serviço da AWS para guardar arquivos. |
| **scrypt** | Um jeito lento (de propósito) de fazer hash de senha, para dificultar adivinhar. |
| **Stack (pilha)** | O conjunto de recursos criados por uma receita do CloudFormation. |

---

## 14. Ideias para o futuro

- **Domínio próprio** (ex.: `cupycoin.com.br`) com CloudFront.
- **Notificações no iPhone** quando passar de um limite (web apps na tela de início suportam notificações).
- **Metas** (ex.: juntar R$ X até dezembro) e **reserva de emergência**.
- **Exportar** um mês para planilha.
- **Testes automáticos** e **GitHub Actions** para implantar sozinho a cada `git push`.

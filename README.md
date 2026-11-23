# CupyCoin 🪙

App pessoal que puxa sozinho os gastos dos seus bancos (pelo Open Finance, via Meu Pluggy),
separa tudo em categorias e mostra quanto foi para cada coisa.

- Tudo roda **no seu computador**. Seus dados ficam na pasta `dados/`.
- O app só **lê** as transações. Ele nunca consegue mexer no seu dinheiro.
- A Pluggy atualiza os dados **1 vez por dia**. Uma compra de hoje aparece até amanhã.

---

## ▶️ Como abrir o app

Dê **dois cliques em `iniciar.bat`**. Uma janela preta abre e o navegador abre sozinho em
http://localhost:3737. Deixe a janela preta aberta enquanto estiver usando o app. Para fechar, é só fechar ela.

Enquanto você não conecta seus bancos, o app mostra **dados de exemplo** para você conhecer como ele funciona.

---

## 🔌 Conectar seus bancos (só precisa fazer uma vez)

Leva uns 15 minutos. Tenha o celular com o app do banco por perto.

### Passo 1: criar sua conta no Meu Pluggy e conectar os bancos

1. Entre em **https://meu.pluggy.ai** e crie sua conta.
2. Clique em **“Conectar Minha Conta”** e escolha o seu banco (Nubank, Inter, Itaú…).
3. O banco vai pedir para você **autorizar no app dele**. Autorize e **espere voltar para o Meu Pluggy**.
   Se fechar a janela antes de voltar, a conexão não termina.
4. Repita para cada banco ou cartão que quiser acompanhar. O limite grátis é de **5 conexões**, todas no seu CPF.

### Passo 2: criar sua “aplicação” no Dashboard da Pluggy

1. Entre em **https://dashboard.pluggy.ai** com **a mesma conta** do passo 1.
   (Se aparecer um aviso de “teste de 15 dias”, pode ignorar: ele não vale para o uso pessoal.)
2. Crie **uma aplicação**. O nome pode ser qualquer um, tipo “CupyCoin”.
3. Na aplicação, copie o **Client ID** e gere o **Client Secret**.
   ⚠️ **O Client Secret só aparece uma vez!** Já deixe a próxima etapa aberta para colar. Se perder, é só gerar outro.

### Passo 3: ligar o MeuPluggy na sua aplicação

1. Ainda no Dashboard, abra a sua aplicação e vá em **Demo → “Conectar Conta”**.
2. Escolha **MeuPluggy**. ⚠️ **Não escolha o seu banco** nem “Sandbox”, esse é o erro mais comum.
   Se o MeuPluggy não aparecer na lista, ative primeiro em **Customização → Conectores**
   (procure “MeuPluggy” na aba “Conectores Diretos”, grupo “Pessoal”).
3. Faça login com a sua conta do Meu Pluggy e autorize.
4. Cada banco que você conectou no passo 1 vai aparecer em **“Itens Conectados”**.
   Clique em cada um e **copie o id** dele (um código tipo `1a2b3c4d-5e6f-...`).

### Passo 4: colocar as chaves no app

1. Na pasta do app, faça uma **cópia** do arquivo `configuracao.env.exemplo` e renomeie a cópia para **`configuracao.env`**.
   (Se o Windows esconder as extensões, confira se o nome não ficou `configuracao.env.txt`.)
2. Abra o `configuracao.env` com o Bloco de Notas e preencha:
   ```
   CLIENT_ID=o-client-id-que-voce-copiou
   CLIENT_SECRET=pluggy_sk_o-secret-que-voce-copiou
   ITEM_IDS=id-do-primeiro-banco,id-do-segundo-banco
   ```
3. Salve, volte para o app e clique em **“Atualizar agora”**. Na primeira vez ele traz até **12 meses** de histórico.

🔒 **Nunca mande o `configuracao.env` para ninguém** (nem para mim pelo chat) e não coloque no GitHub.
O `.gitignore` da pasta já impede que ele e a pasta `dados/` vão para o Git.

---

## 🏷️ Categorias

- O app categoriza sozinho, pelo nome do estabelecimento (iFood → Delivery, Uber → Transporte…).
- Se alguma vier errada, **troque na lista de transações**. O app pergunta se você quer mudar
  as parecidas também, e **aprende** para as próximas.
- Pix e transferências que você manda vão para a categoria **💸 Pix e transferências**, a não ser que uma regra sua diga outra coisa.
- **Toque numa categoria** para abrir os gastos dela no mês. Ali você troca a categoria de uma compra ou define um limite.
  Tocando em **Entradas** você vê o dinheiro que chegou.
- **📈 Investimentos:** mostra quanto você tem investido (CDBs, fundos etc. e a poupança), o rendimento bruto e
  quanto você investiu e resgatou no mês. O dinheiro que vai para os investimentos **não conta como gasto**.
- **Descontar gastos divididos:** crie uma regra “Quando **eu RECEBER dinheiro** e o nome tiver `ana` → Contas da casa”.
  O Pix que ela mandar vai ser **descontado** de Contas da casa e do total de gastos (e não conta como entrada).
  Como a regra vale só quando você recebe, um Pix que você mandar pra ela continua em “Pix e transferências”.
- **Minhas regras** (no fim da página): diga ao app que “quando o nome tiver tal texto, vai para tal categoria”.
  Exemplos: `maria rosa` → Saúde e bem-estar (a terapeuta), `dona ana` → Restaurantes e lanches.
  As regras valem para o que já existe e para tudo o que chegar depois. Use só a parte do nome que sempre aparece.
  Você também cria uma regra direto da transação: troque a categoria e escolha **“Criar regra…”**.
  ⚠️ Alguns bancos não colocam o nome de quem recebeu o Pix na descrição. Se o nome não aparecer na transação, a regra não tem como achar. Nesse caso, troque a categoria na mão.
- **Pagamento de fatura** e **Transferência entre minhas contas** aparecem riscados e **não entram nos gastos**.
  Assim nada é contado duas vezes: as compras do cartão já foram contadas uma a uma.
  (Se você **não** conectou o cartão, o pagamento da fatura entra como “Cartão de crédito”, porque aí ele é o único registro desses gastos.)
- Clique numa categoria do painel para **definir um limite mensal** ou ver as compras dela.

---

## 🔁 Renovar a autorização (1 vez por ano)

Por regra do Open Finance, a autorização vale **1 ano**. O app avisa quando faltar menos de 30 dias.
Para renovar, repita o **Passo 3** (Demo → Conectar Conta → MeuPluggy). Se o id de algum banco mudar,
atualize o `ITEM_IDS` no `configuracao.env`.

---

## ❓ Problemas comuns

| O que aparece | O que fazer |
|---|---|
| “A Pluggy recusou suas chaves” | Confira o CLIENT_ID e o CLIENT_SECRET. Se tiver dúvida, gere um Secret novo. |
| “Não encontrou um dos ITEM_IDS” | Copie de novo o id em Demo → Itens Conectados, sem espaços. |
| Continua em modo demonstração | O arquivo precisa se chamar exatamente `configuracao.env`, com os 3 campos preenchidos. |
| “Node.js não está instalado” | Instale em https://nodejs.org (versão LTS). |
| Uma compra de hoje não apareceu | Normal: a Pluggy atualiza 1 vez por dia. |

Ajuda da Pluggy: meu-suporte@pluggy.ai · Guia oficial: https://docs.pluggy.ai/pt/docs/guides/meu-pluggy-personal-use

---

## 🗂️ Arquivos

```
iniciar.bat                 → abre o app
server.js                   → servidor local
src/pluggy.js               → conversa com a API da Pluggy
src/sincronizar.js          → busca as novidades e junta com o que já existe
src/categorias.js           → regras de categorias (dá para adicionar palavras-chave aqui!)
src/demo.js                 → dados de exemplo
public/                     → a tela do app (HTML, CSS e JavaScript)
dados/                      → seus dados (criada automaticamente)
configuracao.env            → suas chaves (você cria)
```

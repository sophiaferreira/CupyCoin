# 🪙 CupyCoin na AWS

Como o app funciona na AWS (tudo descrito em [`modelo.yaml`](modelo.yaml)):

```
Navegador / iPhone ──https──► Function URL ──► Lambda (o "cérebro": src/app.js)
                                                │  ├─► S3: guarda seus dados, privado e criptografado
                                                │  └─► Parameter Store: chaves da Pluggy e o hash da senha
EventBridge (todo dia às 7h) ───────────────────┘  busca as novidades na Pluggy sozinho
```

| Serviço | Para que serve aqui | Custo |
|---|---|---|
| **Lambda** | Roda o código do app quando alguém abre o link | cota grátis mensal |
| **Function URL** | O endereço `https://…lambda-url.us-east-2.on.aws` do app | sem custo extra |
| **S3** | Guarda o arquivo com seus dados (versões antigas por 30 dias) | centavos |
| **Parameter Store** | Cofre das chaves da Pluggy e do hash da senha | grátis (parâmetros padrão) |
| **EventBridge** | Atualiza os dados sozinho todo dia às 7h | grátis |
| **CloudWatch Logs** | Registros de erro (guardados por 14 dias) | cota grátis |

Região: **us-east-2 (Ohio, EUA)**. É a região do seu projeto da AWS: contas criadas pelo Builder ID ficam numa região fixa (dá para conferir em https://settings.aws.com → Projeto → Visão geral → Região).

---

## Primeira vez

### 1. Instalar o AWS CLI (você)
No PowerShell:
```powershell
winget install -e --id Amazon.AWSCLI
```
Feche e abra o terminal de novo. Confira com `aws --version` (precisa ser 2.32 ou mais nova).

### 2. Entrar na AWS pelo terminal (você)
```powershell
aws login --region us-east-2
```
Abre o seu navegador padrão. **Antes**, entre nesse mesmo navegador com o seu **Builder ID** em https://settings.aws.com.
Aí a página do `aws login` mostra a lista "AWS sign-ins" com o seu projeto: escolha ele e autorize.
(Se aparecer a tela "IAM user sign in", é porque o navegador não está logado no Builder ID.) O login vale por até 12 horas.

### 3. Mandar as chaves da Pluggy para o cofre
```powershell
node aws/enviar-chaves.js
```
Copia o que está no `configuracao.env` para o Parameter Store, criptografado. Nada aparece na tela.

### 4. Criar a senha do app (você, no seu terminal)
```powershell
node aws/definir-senha.js
```
A senha não aparece enquanto você digita. Só o "hash" dela vai para a AWS.

### 5. Implantar
```powershell
node aws/implantar.js
```
No final aparece o **endereço do app**.

### 6. No iPhone
Abra o endereço no **Safari** → botão **Compartilhar** → **Adicionar à Tela de Início**. 🪙

---

## Depois

- **Mudou o código?** Rode `node aws/implantar.js` de novo.
- **Trocar a senha:** `node aws/definir-senha.js`.
- **Renovou a autorização na Pluggy e o id do banco mudou?** Atualize o `configuracao.env` e rode `node aws/enviar-chaves.js`.
- **Seus dados na AWS são independentes dos dados do PC.** A partir de agora, use a versão da AWS. O `iniciar.bat` continua funcionando para testes.
- 📅 **O plano gratuito da AWS acaba em 22/05/2027.** Antes disso, passe a conta para o plano pago (Faturamento → Atualizar). Este app foi montado para caber nas cotas grátis, então o custo esperado é perto de zero.

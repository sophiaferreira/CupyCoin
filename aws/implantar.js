// Manda o CupyCoin para a AWS (ou atualiza, se já estiver lá).
// Rode com: node aws/implantar.js
//
// O que ele faz:
//  1. Junta só os arquivos que o app precisa (NUNCA o configuracao.env nem a pasta dados).
//  2. Cria (uma vez) um bucket para guardar o pacote do código.
//  3. Pede para o CloudFormation criar/atualizar tudo o que está no aws/modelo.yaml.
//  4. Na primeira vez, envia seus dados atuais (regras, histórico) para o S3.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { aws, quemSouEu, parametroExiste, REGIAO, PILHA } = require('./comum');

const RAIZ = path.join(__dirname, '..');
const BUILD = path.join(os.tmpdir(), 'cupycoin-build');

function passo(texto) { console.log(`\n▶ ${texto}`); }

// 0. Conferências
const conta = quemSouEu();
console.log(`Conta AWS: ${conta.Account} · Região: ${REGIAO}`);
const faltando = ['CLIENT_ID', 'CLIENT_SECRET', 'ITEM_IDS', 'SEGREDO_SESSAO', 'SENHA_HASH'].filter((n) => !parametroExiste(n));
if (faltando.length) {
  console.log(`\n⚠ Ainda faltam no Parameter Store: ${faltando.join(', ')}`);
  console.log('  Rode antes: node aws/enviar-chaves.js   e   node aws/definir-senha.js');
  console.log('  (Dá para implantar mesmo assim, mas o app não vai abrir até isso estar feito.)');
}

// 1. Monta a pasta com o código
passo('Juntando os arquivos do app…');
fs.rmSync(BUILD, { recursive: true, force: true });
const APP = path.join(BUILD, 'app');
fs.mkdirSync(APP, { recursive: true });
fs.copyFileSync(path.join(RAIZ, 'lambda.js'), path.join(APP, 'lambda.js'));
// (Cópia feita "na mão": o fs.cpSync do Node trava no Windows com pastas que têm acento, como "Área de Trabalho".)
function copiarPasta(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) copiarPasta(de, para);
    else if (item.isFile()) fs.copyFileSync(de, para);
  }
}
copiarPasta(path.join(RAIZ, 'src'), path.join(APP, 'src'));
copiarPasta(path.join(RAIZ, 'public'), path.join(APP, 'public'));
fs.copyFileSync(path.join(__dirname, 'modelo.yaml'), path.join(BUILD, 'modelo.yaml'));
// Garantia extra: nada de segredos ou dados no pacote.
for (const proibido of ['configuracao.env', 'dados']) {
  if (fs.existsSync(path.join(APP, proibido))) throw new Error(`${proibido} não pode ir no pacote!`);
}

// 2. Bucket para o pacote do código
const bucketPacotes = `cupycoin-pacotes-${conta.Account}-${REGIAO}`;
if (!aws(['s3api', 'head-bucket', '--bucket', bucketPacotes], { permitirErro: true, silencioso: true })) {
  passo(`Criando o bucket de pacotes (${bucketPacotes})…`);
  aws(['s3api', 'create-bucket', '--bucket', bucketPacotes, '--create-bucket-configuration', `LocationConstraint=${REGIAO}`]);
  aws(['s3api', 'put-public-access-block', '--bucket', bucketPacotes, '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true']);
}

// 3. Empacota e implanta
passo('Empacotando o código…');
const modeloEmpacotado = path.join(BUILD, 'modelo-empacotado.yaml');
aws(['cloudformation', 'package', '--template-file', path.join(BUILD, 'modelo.yaml'), '--s3-bucket', bucketPacotes,
  '--output-template-file', modeloEmpacotado], { json: false });

passo('Criando/atualizando os recursos na AWS (pode levar uns 2 minutos)…');
aws(['cloudformation', 'deploy', '--template-file', modeloEmpacotado, '--stack-name', PILHA,
  '--capabilities', 'CAPABILITY_IAM', '--no-fail-on-empty-changeset'], { json: false });

const pilha = aws(['cloudformation', 'describe-stacks', '--stack-name', PILHA]).Stacks[0];
const saida = Object.fromEntries((pilha.Outputs || []).map((o) => [o.OutputKey, o.OutputValue]));

// 4. Primeira vez: envia seus dados atuais
const arquivoLocal = path.join(RAIZ, 'dados', 'meus-dados.json');
const jaTemDados = aws(['s3api', 'head-object', '--bucket', saida.BucketDados, '--key', 'dados/meus-dados.json'], { permitirErro: true, silencioso: true });
if (!jaTemDados && fs.existsSync(arquivoLocal)) {
  passo('Enviando seus dados atuais (histórico, regras e limites) para o S3…');
  aws(['s3', 'cp', arquivoLocal, `s3://${saida.BucketDados}/dados/meus-dados.json`, '--only-show-errors'], { json: false });
}

console.log('\n✅ Pronto! O CupyCoin está na AWS.');
console.log(`\n   Endereço do app: ${saida.EnderecoDoApp}`);
console.log('\n   No iPhone: abra esse link no Safari → Compartilhar → "Adicionar à Tela de Início".\n');

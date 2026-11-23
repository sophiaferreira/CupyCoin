// Funções usadas pelos scripts da AWS: chamar o AWS CLI e guardar valores no Parameter Store.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Contas criadas pelo Builder ID ("projetos") ficam numa região fixa. Para o Brasil: us-east-2 (Ohio, EUA).
// Dá para trocar com a variável AWS_REGION, se o seu projeto estiver em outra região.
const REGIAO = process.env.AWS_REGION || 'us-east-2';
const PILHA = 'cupycoin';
const PREFIXO = '/cupycoin/';

// Chama o AWS CLI. Nunca mostra na tela os argumentos (que podem ter segredos).
function aws(args, { json = true, silencioso = false, permitirErro = false } = {}) {
  const exe = process.platform === 'win32' ? 'aws.exe' : 'aws';
  const final = [...args, '--region', REGIAO];
  if (json) final.push('--output', 'json');
  const r = spawnSync(exe, final, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (r.error && r.error.code === 'ENOENT') {
    console.error('\n✖ O AWS CLI não está instalado. Veja o passo "Instalar o AWS CLI" no aws/README-AWS.md.\n');
    process.exit(1);
  }
  if (r.status !== 0) {
    if (permitirErro) return null;
    const msg = (r.stderr || '').trim();
    if (/Unable to locate credentials|ExpiredToken|login|expired/i.test(msg)) {
      console.error('\n✖ Você não está logada no AWS CLI (ou o login expirou). Rode:  aws login\n');
    } else if (!silencioso) {
      console.error('\n✖ Erro do AWS CLI:\n' + msg + '\n');
    }
    process.exit(1);
  }
  if (!json) return r.stdout;
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}

// Guarda um valor no Parameter Store sem passar o segredo pela linha de comando:
// escreve um arquivo temporário, manda pro CLI e apaga na hora.
function guardarParametro(nome, valor, secreto) {
  const tmp = path.join(os.tmpdir(), `cupycoin-param-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({
    Name: PREFIXO + nome,
    Value: String(valor),
    Type: secreto ? 'SecureString' : 'String',
    Overwrite: true,
  }), { mode: 0o600 });
  try {
    aws(['ssm', 'put-parameter', '--cli-input-json', `file://${tmp}`]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function parametroExiste(nome) {
  return Boolean(aws(['ssm', 'get-parameter', '--name', PREFIXO + nome], { permitirErro: true, silencioso: true }));
}

function quemSouEu() {
  return aws(['sts', 'get-caller-identity']);
}

module.exports = { aws, guardarParametro, parametroExiste, quemSouEu, REGIAO, PILHA, PREFIXO };

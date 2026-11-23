// Define (ou troca) a senha para entrar no CupyCoin pela internet.
// Rode no SEU terminal com: node aws/definir-senha.js
// A senha não aparece enquanto você digita, e só o "hash" dela vai para a AWS.

const readline = require('readline');
const { gerarHashDeSenha } = require('../src/autenticacao');
const { guardarParametro, quemSouEu } = require('./comum');

function perguntarEscondido(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (texto) => {
      // Mostra a pergunta, mas troca o que você digita por nada.
      if (texto.includes(pergunta)) rl.output.write(texto);
    };
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(resposta);
    });
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error('✖ Rode este comando no seu terminal (ele precisa perguntar a senha).');
    process.exit(1);
  }
  const conta = quemSouEu();
  console.log(`Conta AWS: ${conta.Account}\n`);
  console.log('Escolha uma senha com pelo menos 10 caracteres (dica: uma frase, tipo "minha moeda dourada favorita").');
  const senha = await perguntarEscondido('Nova senha: ');
  if (senha.length < 10) {
    console.error('✖ A senha precisa ter pelo menos 10 caracteres.');
    process.exit(1);
  }
  const repetida = await perguntarEscondido('Repita a senha: ');
  if (senha !== repetida) {
    console.error('✖ As senhas não são iguais. Tente de novo.');
    process.exit(1);
  }
  guardarParametro('SENHA_HASH', gerarHashDeSenha(senha), true);
  console.log('\n✔ Senha definida! (pode levar até 5 minutos para valer, se o app já estava aberto)');
})();

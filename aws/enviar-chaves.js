// Copia as chaves da Pluggy do seu configuracao.env para o Parameter Store da AWS (criptografadas).
// Rode com: node aws/enviar-chaves.js
// Nada é mostrado na tela além de "ok".

const crypto = require('crypto');
const { lerConfiguracao } = require('../src/banco');
const { guardarParametro, parametroExiste, quemSouEu } = require('./comum');

const conta = quemSouEu();
console.log(`Conta AWS: ${conta.Account}`);

const config = lerConfiguracao();
if (!config.configurado) {
  console.error('✖ O configuracao.env não está preenchido. Preencha antes (veja o README.md).');
  process.exit(1);
}

guardarParametro('CLIENT_ID', config.clientId, false);
console.log('✔ CLIENT_ID guardado');
guardarParametro('CLIENT_SECRET', config.clientSecret, true);
console.log('✔ CLIENT_SECRET guardado (criptografado)');
guardarParametro('ITEM_IDS', config.itemIds.join(','), false);
console.log(`✔ ITEM_IDS guardado (${config.itemIds.length} banco(s))`);

// Segredo usado para assinar o cookie de login. Gerado uma vez só.
if (!parametroExiste('SEGREDO_SESSAO')) {
  guardarParametro('SEGREDO_SESSAO', crypto.randomBytes(32).toString('base64'), true);
  console.log('✔ SEGREDO_SESSAO criado (criptografado)');
} else {
  console.log('✔ SEGREDO_SESSAO já existia');
}

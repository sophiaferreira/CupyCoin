// Guarda os dados num arquivo JSON dentro da pasta "dados".
// Fica tudo no seu computador.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PASTA_DADOS = path.join(RAIZ, 'dados');
const ARQUIVO_CONFIG = path.join(RAIZ, 'configuracao.env');

function lerConfiguracao() {
  const config = {};
  if (fs.existsSync(ARQUIVO_CONFIG)) {
    const texto = fs.readFileSync(ARQUIVO_CONFIG, 'utf8').replace(/^﻿/, '');
    for (const linha of texto.split(/\r?\n/)) {
      const l = linha.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i < 0) continue;
      const chave = l.slice(0, i).trim();
      let valor = l.slice(i + 1).trim();
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1);
      }
      config[chave] = valor;
    }
  }
  const itemIds = String(config.ITEM_IDS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('cole-'));
  const clientId = (config.CLIENT_ID || '').trim();
  const clientSecret = (config.CLIENT_SECRET || '').trim();
  const configurado = Boolean(clientId && clientSecret && itemIds.length && !clientId.startsWith('cole-'));
  return {
    clientId,
    clientSecret,
    itemIds,
    porta: Number(config.PORTA) || 3737,
    configurado,
    arquivoExiste: fs.existsSync(ARQUIVO_CONFIG),
  };
}

function bancoVazio() {
  return {
    versao: 1,
    contas: {},
    itens: {},
    transacoes: {},
    aprendidas: {},
    regras: [],
    investimentos: {},
    limites: {},
    ultimaSincronizacao: null,
    ultimoErro: null,
  };
}

function caminhoBanco(demo) {
  return path.join(PASTA_DADOS, demo ? 'demonstracao.json' : 'meus-dados.json');
}

// Atualiza dados salvos quando categorias mudam de nome ou são juntadas.
function migrarCategorias(banco) {
  const { RENOMEADAS } = require('./categorias');
  const novo = (c) => RENOMEADAS[c] || c;
  for (const r of banco.regras || []) r.categoria = novo(r.categoria);
  for (const k of Object.keys(banco.aprendidas || {})) banco.aprendidas[k] = novo(banco.aprendidas[k]);
  for (const t of Object.values(banco.transacoes || {})) t.categoria = novo(t.categoria);
  const limites = {};
  for (const [c, v] of Object.entries(banco.limites || {})) limites[novo(c)] = (limites[novo(c)] || 0) + v;
  banco.limites = limites;
  return banco;
}

function carregar(demo) {
  const arquivo = caminhoBanco(demo);
  if (!fs.existsSync(arquivo)) return null;
  try {
    return migrarCategorias({ ...bancoVazio(), ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) });
  } catch (e) {
    // Arquivo corrompido: guarda uma cópia e começa de novo em vez de quebrar.
    fs.copyFileSync(arquivo, arquivo + '.corrompido-' + Date.now());
    return null;
  }
}

function salvar(banco, demo) {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  const arquivo = caminhoBanco(demo);
  const temporario = arquivo + '.tmp';
  fs.writeFileSync(temporario, JSON.stringify(banco, null, 1));
  fs.renameSync(temporario, arquivo);
}

module.exports = { lerConfiguracao, carregar, salvar, bancoVazio, migrarCategorias, RAIZ };

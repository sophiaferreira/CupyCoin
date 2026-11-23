// CupyCoin: versão da AWS.
// O Lambda chama a função "handler" em dois casos:
//  1) Alguém abriu o endereço do app (pelo "Function URL", que é o link https do app).
//  2) O agendador da AWS (EventBridge) mandou atualizar os dados, uma vez por dia.

const { armazenamentoS3 } = require('./src/armazenamento');
const { criarApp } = require('./src/app');

// As chaves da Pluggy e a senha ficam no Parameter Store (um cofre da AWS), em /cupycoin/...
const PREFIXO = process.env.PREFIXO_PARAMETROS || '/cupycoin/';
let configEmCache = null;
let configLidaEm = 0;

async function obterConfig() {
  if (configEmCache && Date.now() - configLidaEm < 5 * 60 * 1000) return configEmCache;
  const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({});
  const valores = {};
  let proximo;
  do {
    const resp = await ssm.send(new GetParametersByPathCommand({ Path: PREFIXO, WithDecryption: true, NextToken: proximo }));
    for (const p of resp.Parameters || []) valores[p.Name.slice(PREFIXO.length)] = p.Value;
    proximo = resp.NextToken;
  } while (proximo);

  const itemIds = String(valores.ITEM_IDS || '').split(/[,;\s]+/).filter(Boolean);
  configEmCache = {
    clientId: valores.CLIENT_ID || '',
    clientSecret: valores.CLIENT_SECRET || '',
    itemIds,
    configurado: Boolean(valores.CLIENT_ID && valores.CLIENT_SECRET && itemIds.length),
    senhaHash: valores.SENHA_HASH || '',
    segredoSessao: valores.SEGREDO_SESSAO || '',
  };
  configLidaEm = Date.now();
  return configEmCache;
}

const app = criarApp({
  armazenamento: armazenamentoS3(process.env.BUCKET_DADOS),
  obterConfig,
  exigirLogin: true,
});

exports.handler = async (evento) => {
  // 2) Atualização automática diária
  if (evento && evento.acao === 'sincronizar') {
    const r = await app.rodarSincronizacao();
    return { ok: true, novas: r.novas };
  }

  // 1) Pedido vindo do navegador (formato do Function URL)
  const http = (evento.requestContext && evento.requestContext.http) || {};
  const headers = {};
  for (const [k, v] of Object.entries(evento.headers || {})) headers[k.toLowerCase()] = v;
  if (evento.cookies && evento.cookies.length) headers.cookie = evento.cookies.join('; ');
  const corpoTexto = evento.body ? (evento.isBase64Encoded ? Buffer.from(evento.body, 'base64').toString('utf8') : evento.body) : '';

  try {
    const r = await app.tratar({ metodo: http.method || 'GET', caminho: evento.rawPath || '/', headers, corpoTexto });
    const corpo = Buffer.isBuffer(r.corpo) ? r.corpo : Buffer.from(String(r.corpo ?? ''), 'utf8');
    return {
      statusCode: r.status,
      headers: r.headers,
      cookies: r.cookies || [],
      body: r.binario ? corpo.toString('base64') : corpo.toString('utf8'),
      isBase64Encoded: Boolean(r.binario),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ erro: 'Erro interno' }) };
  }
};

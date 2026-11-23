// Conversa com a API da Pluggy (https://docs.pluggy.ai).
// Só leitura: este código nunca movimenta dinheiro.

const BASE = 'https://api.pluggy.ai';

class ErroPluggy extends Error {
  constructor(mensagem, status, codigo) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

async function chamar(caminho, { apiKey, metodo = 'GET', corpo } = {}) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  if (corpo) headers['Content-Type'] = 'application/json';

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let resp;
    try {
      resp = await fetch(BASE + caminho, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      if (tentativa === 3) throw new ErroPluggy('Não consegui falar com a Pluggy. Sua internet está funcionando?', 0, 'SEM_CONEXAO');
      await esperar(2000 * tentativa);
      continue;
    }

    if (resp.status === 429 && tentativa < 3) {
      // Muitas chamadas seguidas: a Pluggy pede para esperar.
      const segundos = Number(resp.headers.get('retry-after')) || 60;
      await esperar(Math.min(segundos, 60) * 1000);
      continue;
    }

    const texto = await resp.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

    if (!resp.ok) {
      const codigo = dados && (dados.codeDescription || dados.code);
      let mensagem = (dados && dados.message) || `Erro ${resp.status} da Pluggy`;
      if (resp.status === 401 || resp.status === 403) {
        mensagem = 'A Pluggy recusou suas chaves. Confira o CLIENT_ID e o CLIENT_SECRET no arquivo configuracao.env.';
      } else if (resp.status === 404 && caminho.startsWith('/items/')) {
        mensagem = 'A Pluggy não encontrou um dos ITEM_IDS do arquivo configuracao.env. Confira se copiou certinho.';
      }
      throw new ErroPluggy(mensagem, resp.status, codigo);
    }
    return dados;
  }
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// A chave da API vale por 2 horas. Pedimos uma nova a cada sincronização.
async function autenticar(clientId, clientSecret) {
  const dados = await chamar('/auth', { metodo: 'POST', corpo: { clientId, clientSecret } });
  if (!dados || !dados.apiKey) throw new ErroPluggy('A Pluggy não devolveu a chave de acesso.', 0, 'SEM_APIKEY');
  return dados.apiKey;
}

async function buscarItem(apiKey, itemId) {
  return chamar(`/items/${encodeURIComponent(itemId)}`, { apiKey });
}

async function buscarContas(apiKey, itemId) {
  const contas = [];
  let pagina = 1;
  for (;;) {
    const dados = await chamar(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${pagina}&pageSize=500`, { apiKey });
    contas.push(...(dados.results || []));
    if (!dados.totalPages || pagina >= dados.totalPages) break;
    pagina++;
  }
  return contas;
}

async function buscarInvestimentos(apiKey, itemId) {
  const lista = [];
  let pagina = 1;
  for (;;) {
    const dados = await chamar(`/investments?itemId=${encodeURIComponent(itemId)}&page=${pagina}&pageSize=500`, { apiKey });
    lista.push(...(dados.results || []));
    if (!dados.totalPages || pagina >= dados.totalPages) break;
    pagina++;
  }
  return lista;
}

// Transações por cursor (/v2/transactions). A resposta traz "next" pronto
// para ser colado no fim do caminho, até ele vir vazio.
async function buscarTransacoes(apiKey, accountId, dataInicio) {
  const params = new URLSearchParams({ accountId });
  if (dataInicio) params.set('dateFrom', dataInicio);
  let caminho = `/v2/transactions?${params}`;
  const todas = [];
  for (let paginas = 0; paginas < 200; paginas++) {
    const dados = await chamar(caminho, { apiKey });
    todas.push(...(dados.results || []));
    if (!dados.next) break;
    caminho = '/v2/transactions' + (dados.next.startsWith('?') ? dados.next : '?' + dados.next);
  }
  return todas;
}

module.exports = { autenticar, buscarItem, buscarContas, buscarTransacoes, buscarInvestimentos, ErroPluggy };

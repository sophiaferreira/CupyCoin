// O "coração" do CupyCoin: recebe um pedido (abrir a página, mudar categoria, atualizar…)
// e devolve a resposta. É o mesmo código no seu computador (server.js) e na AWS (lambda.js).

const fs = require('fs');
const path = require('path');

const { bancoVazio } = require('./banco');
const { sincronizar, aplicarCategorias } = require('./sincronizar');
const { gerarDemonstracao } = require('./demo');
const { CATEGORIAS, DIRECOES_REGRA, chaveDoEstabelecimento, textoDaRegra, regraQueBate } = require('./categorias');
const auth = require('./autenticacao');

const HORAS_PARA_ATUALIZAR = 6;
const PASTA_PUBLICA = path.join(__dirname, '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};
// Arquivos que a tela de login pode carregar sem estar logada.
const LIVRES_SEM_LOGIN = new Set(['entrar.html', 'entrar.js', 'estilo.css', 'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png']);

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

/**
 * @param {object} opcoes
 * @param {{carregar: Function, salvar: Function}} opcoes.armazenamento
 * @param {() => Promise<object>} opcoes.obterConfig  devolve { clientId, clientSecret, itemIds, configurado, senhaHash, segredoSessao }
 * @param {boolean} opcoes.exigirLogin  true na AWS (internet), false no seu PC (só localhost)
 */
function criarApp({ armazenamento, obterConfig, exigirLogin }) {
  let sincronizando = null;

  async function abrir(config) {
    const demo = !config.configurado;
    let banco = await armazenamento.carregar(demo);
    if (!banco) {
      banco = demo ? gerarDemonstracao() : bancoVazio();
      await armazenamento.salvar(banco, demo);
    }
    return { banco, demo };
  }

  function precisaAtualizar(banco, demo) {
    if (demo) return false;
    if (!banco.ultimaSincronizacao) return true;
    return Date.now() - new Date(banco.ultimaSincronizacao).getTime() > HORAS_PARA_ATUALIZAR * 3600 * 1000;
  }

  function estadoParaTela(banco, demo, config) {
    return {
      demo,
      configuracao: { bancosConfigurados: config.itemIds.length },
      categorias: CATEGORIAS,
      contas: Object.values(banco.contas),
      itens: Object.values(banco.itens),
      transacoes: Object.values(banco.transacoes),
      limites: banco.limites,
      regras: banco.regras || [],
      investimentos: Object.values(banco.investimentos || {}),
      ultimaSincronizacao: banco.ultimaSincronizacao,
      ultimoErro: banco.ultimoErro,
      sincronizando: Boolean(sincronizando),
      precisaAtualizar: precisaAtualizar(banco, demo),
      podeSair: exigirLogin,
    };
  }

  // Busca as novidades na Pluggy. Usado pelo botão "Atualizar agora" e pela atualização automática diária.
  async function rodarSincronizacao() {
    const config = await obterConfig();
    if (!config.configurado) return { novas: 0, avisos: [], demo: true };
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      const { banco } = await abrir(config);
      try {
        const resultado = await sincronizar(banco, config);
        await armazenamento.salvar(banco, false);
        console.log(`✔ Atualizado: ${resultado.novas} transações novas.`);
        return resultado;
      } catch (e) {
        banco.ultimoErro = { mensagem: e.message, em: new Date().toISOString() };
        await armazenamento.salvar(banco, false);
        console.error('✖ Erro ao atualizar:', e.message);
        throw e;
      } finally {
        sincronizando = null;
      }
    })();
    return sincronizando;
  }

  function json(status, obj, extras = {}) {
    return {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURANCA },
      corpo: JSON.stringify(obj),
      ...extras,
    };
  }

  function arquivo(nome) {
    const caminho = path.join(PASTA_PUBLICA, nome);
    if (!caminho.startsWith(PASTA_PUBLICA) || !fs.existsSync(caminho) || fs.statSync(caminho).isDirectory()) {
      return { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA }, corpo: 'Não encontrado' };
    }
    const ext = path.extname(caminho);
    const binario = ext === '.png';
    return {
      status: 200,
      headers: { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', ...SEGURANCA },
      corpo: fs.readFileSync(caminho),
      binario,
    };
  }

  /**
   * @param {object} req { metodo, caminho, headers (minúsculos), corpoTexto }
   */
  async function tratar(req) {
    const metodo = req.metodo;
    const caminho = req.caminho || '/';
    const cookies = auth.lerCookies(req.headers.cookie);

    // Proteção contra outro site tentando mandar pedidos em seu nome.
    if (metodo === 'POST' && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return json(403, { erro: 'Origem não permitida' });
      } catch {
        return json(403, { erro: 'Origem não permitida' });
      }
    }

    const config = await obterConfig();
    let corpo = {};
    if (metodo === 'POST' && req.corpoTexto) {
      if (req.corpoTexto.length > 1e6) return json(413, { erro: 'Pedido grande demais' });
      try { corpo = JSON.parse(req.corpoTexto); } catch { return json(400, { erro: 'Pedido inválido' }); }
    }

    // ---------- Login ----------
    if (exigirLogin) {
      if (!config.senhaHash || !config.segredoSessao) {
        return json(503, { erro: 'A senha do app ainda não foi definida. Rode o script de definir senha.' });
      }
      if (metodo === 'POST' && caminho === '/api/entrar') {
        const { banco, demo } = await abrir(config);
        const bloqueado = auth.estaBloqueado(banco);
        if (bloqueado) return json(429, { erro: `Muitas tentativas erradas. Tente de novo em ${auth.MINUTOS_BLOQUEIO} minutos.` });
        if (!auth.senhaConfere(corpo.senha, config.senhaHash)) {
          auth.registrarFalha(banco);
          await armazenamento.salvar(banco, demo);
          await new Promise((r) => setTimeout(r, 800));
          return json(401, { erro: 'Senha incorreta.' });
        }
        auth.registrarSucesso(banco);
        await armazenamento.salvar(banco, demo);
        return json(200, { ok: true }, { cookies: [auth.criarCookieDeSessao(config.segredoSessao)] });
      }
      if (metodo === 'POST' && caminho === '/api/sair') {
        return json(200, { ok: true }, { cookies: [auth.cookieDeSaida()] });
      }
      if (!auth.sessaoValida(cookies, config.segredoSessao)) {
        if (caminho.startsWith('/api/')) return json(401, { erro: 'Faça login de novo.' });
        const nome = decodeURIComponent(caminho.slice(1));
        if (metodo === 'GET' && LIVRES_SEM_LOGIN.has(nome)) return arquivo(nome);
        return arquivo('entrar.html');
      }
    }

    // ---------- Daqui pra baixo: já está logada (ou é o seu PC) ----------
    if (metodo === 'GET' && caminho === '/api/estado') {
      const { banco, demo } = await abrir(config);
      return json(200, estadoParaTela(banco, demo, config));
    }

    if (metodo === 'POST' && caminho === '/api/sincronizar') {
      let resposta;
      try {
        resposta = { ok: true, ...(await rodarSincronizacao()) };
      } catch (e) {
        resposta = { ok: false, erro: e.message };
      }
      const { banco, demo } = await abrir(config);
      return json(200, { ...resposta, estado: estadoParaTela(banco, demo, config) });
    }

    if (metodo === 'POST' && caminho === '/api/categoria') {
      const { banco, demo } = await abrir(config);
      const { id, categoria, aplicarParecidas } = corpo;
      const t = banco.transacoes[id];
      if (!t || !CATEGORIAS.some((c) => c.nome === categoria)) return json(400, { erro: 'Dados inválidos' });
      t.categoria = categoria;
      t.categoriaManual = true;
      let alteradas = 1;
      if (aplicarParecidas) {
        const chave = chaveDoEstabelecimento(t.descricao);
        banco.aprendidas[chave] = categoria;
        for (const outra of Object.values(banco.transacoes)) {
          if (outra.id !== id && !outra.categoriaManual && chaveDoEstabelecimento(outra.descricao) === chave && outra.categoria !== categoria) alteradas++;
        }
        aplicarCategorias(banco);
      }
      await armazenamento.salvar(banco, demo);
      return json(200, { ok: true, alteradas, estado: estadoParaTela(banco, demo, config) });
    }

    if (metodo === 'POST' && caminho === '/api/regras') {
      const { banco, demo } = await abrir(config);
      const { texto, categoria } = corpo;
      const direcao = DIRECOES_REGRA.includes(corpo.direcao) ? corpo.direcao : 'ambas';
      const trecho = textoDaRegra(texto);
      if (trecho.length < 3) return json(400, { erro: 'Escreva pelo menos 3 letras do nome.' });
      if (!CATEGORIAS.some((c) => c.nome === categoria)) return json(400, { erro: 'Categoria inválida' });
      banco.regras = banco.regras || [];
      const existente = banco.regras.find((r) => textoDaRegra(r.texto) === trecho && (r.direcao || 'ambas') === direcao);
      if (existente) existente.categoria = categoria;
      else banco.regras.push({ id: 'r' + Date.now().toString(36), texto: String(texto).trim().slice(0, 80), categoria, direcao });
      const nova = { texto, direcao };
      // A regra vale também para o que já existe, inclusive transações que você tinha corrigido na mão.
      for (const t of Object.values(banco.transacoes)) {
        if (t.categoriaManual && regraQueBate(t.descricao, [nova], t.direcao)) t.categoriaManual = false;
      }
      aplicarCategorias(banco);
      await armazenamento.salvar(banco, demo);
      const afetadas = Object.values(banco.transacoes).filter((t) => regraQueBate(t.descricao, [nova], t.direcao)).length;
      return json(200, { ok: true, afetadas, estado: estadoParaTela(banco, demo, config) });
    }

    if (metodo === 'POST' && caminho === '/api/regras/remover') {
      const { banco, demo } = await abrir(config);
      banco.regras = (banco.regras || []).filter((r) => r.id !== corpo.id);
      aplicarCategorias(banco);
      await armazenamento.salvar(banco, demo);
      return json(200, { ok: true, estado: estadoParaTela(banco, demo, config) });
    }

    if (metodo === 'POST' && caminho === '/api/limite') {
      const { banco, demo } = await abrir(config);
      const { categoria, valor } = corpo;
      if (!CATEGORIAS.some((c) => c.nome === categoria)) return json(400, { erro: 'Categoria inválida' });
      const v = Number(valor);
      if (!v || v <= 0) delete banco.limites[categoria];
      else banco.limites[categoria] = Math.round(v * 100) / 100;
      await armazenamento.salvar(banco, demo);
      return json(200, { ok: true, estado: estadoParaTela(banco, demo, config) });
    }

    if (metodo === 'GET') {
      const nome = caminho === '/' ? 'index.html' : decodeURIComponent(caminho.slice(1));
      if (nome === 'entrar.html' && !exigirLogin) return arquivo('index.html');
      return arquivo(nome);
    }
    return json(405, { erro: 'Método não permitido' });
  }

  return { tratar, rodarSincronizacao };
}

module.exports = { criarApp };

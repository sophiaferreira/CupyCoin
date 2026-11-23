// Login com senha (só na versão da AWS, que fica na internet).
// - A senha nunca é guardada: guardamos só um "hash" (uma impressão digital dela) feito com scrypt.
// - Depois do login, o navegador recebe um cookie assinado que vale por 30 dias.

const crypto = require('crypto');

const DIAS_DE_SESSAO = 30;
const MAX_FALHAS = 5;
const MINUTOS_BLOQUEIO = 15;

function gerarHashDeSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(senha), sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${sal.toString('base64')}$${hash.toString('base64')}`;
}

function senhaConfere(senha, hashGuardado) {
  try {
    const [tipo, n, salB64, hashB64] = String(hashGuardado || '').split('$');
    if (tipo !== 'scrypt') return false;
    const esperado = Buffer.from(hashB64, 'base64');
    const calculado = crypto.scryptSync(String(senha), Buffer.from(salB64, 'base64'), esperado.length, { N: Number(n), r: 8, p: 1 });
    return crypto.timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

function assinar(valor, segredo) {
  return crypto.createHmac('sha256', segredo).update(valor).digest('base64url');
}

function criarCookieDeSessao(segredo) {
  const expira = Date.now() + DIAS_DE_SESSAO * 86400 * 1000;
  const valor = `${expira}.${assinar(String(expira), segredo)}`;
  return `sessao=${valor}; Path=/; Max-Age=${DIAS_DE_SESSAO * 86400}; HttpOnly; Secure; SameSite=Strict`;
}

function cookieDeSaida() {
  return 'sessao=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict';
}

function sessaoValida(cookies, segredo) {
  const valor = cookies && cookies.sessao;
  if (!valor || !segredo) return false;
  const [expira, assinatura] = valor.split('.');
  if (!expira || !assinatura || Number(expira) < Date.now()) return false;
  const esperada = assinar(expira, segredo);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Bloqueio depois de várias senhas erradas seguidas (guardado junto com os dados).
function estaBloqueado(banco) {
  const s = banco.seguranca || {};
  return s.bloqueadoAte && new Date(s.bloqueadoAte).getTime() > Date.now() ? s.bloqueadoAte : null;
}

function registrarFalha(banco) {
  const s = (banco.seguranca = banco.seguranca || { falhas: 0 });
  s.falhas = (s.falhas || 0) + 1;
  if (s.falhas >= MAX_FALHAS) {
    s.bloqueadoAte = new Date(Date.now() + MINUTOS_BLOQUEIO * 60000).toISOString();
    s.falhas = 0;
  }
}

function registrarSucesso(banco) {
  banco.seguranca = { falhas: 0, bloqueadoAte: null, ultimoLogin: new Date().toISOString() };
}

function lerCookies(cabecalho) {
  const cookies = {};
  for (const parte of String(cabecalho || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) cookies[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return cookies;
}

module.exports = {
  gerarHashDeSenha, senhaConfere, criarCookieDeSessao, cookieDeSaida, sessaoValida,
  estaBloqueado, registrarFalha, registrarSucesso, lerCookies, MINUTOS_BLOQUEIO,
};

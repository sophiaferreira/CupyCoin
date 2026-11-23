// Categorização automática das transações.
// A ordem das regras importa: a primeira que bater é a escolhida.
// Por isso "amazon prime" vem antes de "amazon", "mercado livre" antes de "mercado" etc.

const CATEGORIAS = [
  { nome: 'Mercado', emoji: '🛒' },
  { nome: 'Restaurantes', emoji: '🍔' },
  { nome: 'Transporte', emoji: '🚗' },
  { nome: 'Compras online', emoji: '📦' },
  { nome: 'Roupas e beleza', emoji: '👗' },
  { nome: 'Assinaturas', emoji: '📺' },
  { nome: 'Lazer', emoji: '🎉' },
  { nome: 'Saúde e bem-estar', emoji: '💊' },
  { nome: 'Contas da casa', emoji: '🏠' },
  { nome: 'Educação', emoji: '📚' },
  { nome: 'Viagem', emoji: '✈️' },
  { nome: 'Pets', emoji: '🐶' },
  { nome: 'Tarifas e juros', emoji: '🏦' },
  { nome: 'Pix e transferências', emoji: '💸' },
  { nome: 'Cartão de crédito', emoji: '💳' },
  { nome: 'Outros', emoji: '📌' },
  // Entradas de dinheiro
  { nome: 'Entradas', emoji: '💰', entrada: true },
  { nome: 'Estornos e reembolsos', emoji: '↩️', entrada: true },
  // Dinheiro que vai para (ou volta de) investimentos: aparece na seção Investimentos, não nos gastos
  { nome: 'Investimentos', emoji: '📈', investimento: true },
  // Não contam nos gastos (evitam contar a mesma coisa duas vezes)
  { nome: 'Pagamento de fatura', emoji: '🧾', ignorar: true },
  { nome: 'Transferência entre minhas contas', emoji: '🔁', ignorar: true },
];

// Palavras-chave já normalizadas (minúsculas, sem acento).
// Espaços nas pontas ajudam a pegar só a palavra inteira (ex.: " bar ").
const REGRAS = [
  ['Pagamento de fatura', ['pagamento de fatura', 'pagto fatura', 'pgto fatura', 'pag fatura', 'pagamento fatura', 'fatura cartao', 'pagamento recebido', 'pagamento cartao', 'pagto cartao', 'pgto cartao', 'pagamento de cartao', 'pagamento efetuado', 'pag boleto cartao']],
  ['Investimentos', ['conta investimento', 'resg poup', 'aplic poup', 'resgate poup', 'aplicacao poup', 'resgate poupanca', 'aplicacao poupanca', 'aplicacao automatica', 'resgate automatico', 'remuneracao aplicacao', 'aplicacao cdb', 'resgate cdb', 'aplicacao rdb', 'resgate rdb', 'aplicacao lci', 'resgate lci', 'aplicacao lca', 'resgate lca', 'tesouro direto', 'aplicacao fundo', 'resgate fundo', 'aplic fundo', 'resg fundo']],
  ['Transferência entre minhas contas', ['transferencia entre contas', 'mesma titularidade']],
  ['Estornos e reembolsos', ['estorno', 'reembolso', 'cashback', 'devolucao']],
  ['Tarifas e juros', ['tarifa', 'juros', ' iof', 'anuidade', 'multa', 'encargo', 'mora ']],
  ['Assinaturas', ['netflix', 'spotify', 'disney', 'hbo', 'max.com', 'amazon prime', 'prime video', 'primevideo', 'youtube', 'globoplay', 'apple.com', 'google one', 'google storage', 'icloud', 'deezer', 'paramount', 'crunchyroll', 'chatgpt', 'openai', 'anthropic', 'claude.ai', 'canva', 'xbox game pass', 'playstation plus', 'twitch', 'microsoft', 'melimais', 'meli+', 'amazonprime', 'tidal', 'linkedin']],
  ['Restaurantes', ['ifood', ' ifd ', 'rappi', 'ze delivery', 'zedelivery', 'aiqfome', 'james delivery', 'uber eats', 'ubereats', '99food', 'keeta']],
  ['Transporte', ['seguro', 'porto seguro', 'bradesco auto', 'mapfre', 'allianz', 'tokio marine', ' hdi ', 'liberty seg', 'youse', 'azul seguros', 'uber', '99app', '99 app', '99pop', '99 pop', '99 tecnologia', 'cabify', 'indrive', 'metro', 'sptrans', 'bilhete unico', 'cptm', 'posto', 'shell', 'ipiranga', 'petrobras', 'br mania', 'combustivel', 'estapar', 'estacionamento', 'sem parar', 'conectcar', 'veloe', 'taggy', 'pedagio', 'recarga top']],
  ['Compras online', ['mercadolivre', 'mercado livre', 'mercadopago', 'mercado pago', 'amazon', 'shopee', 'shein', 'aliexpress', 'temu', 'magalu', 'magazine luiza', 'americanas', 'casas bahia', 'kabum', 'submarino', 'tiktok shop', 'temu']],
  ['Mercado', ['supermerc', 'supermercado', 'mercado', 'carrefour', 'pao de acucar', 'assai', 'atacadao', 'atacadista', 'hortifruti', 'sams club', ' sams ', 'confianca', 'tenda atacado', 'roldao', 'makro','oba hort', 'sacolao', 'quitanda', 'dia brasil', 'big bompreco', 'guanabara', 'zaffari', 'savegnago']],
  ['Restaurantes', ['restaurante', 'lanchonete', 'padaria', 'panificadora', 'burger', 'mcdonald', 'mc donald', ' bk ', 'subway', 'starbucks', 'pizzaria', 'pizza', 'cafeteria', ' cafe ', ' bar ', 'outback', 'habibs', 'spoleto', 'giraffas', 'sorveteria', 'acai', 'churrascaria', 'sushi', 'coco bambu', 'madero', 'cacau show', 'kopenhagen', 'bakery', 'doceria', 'confeitaria', 'salgados', 'pastelaria', 'hamburgueria', 'esfiharia', 'restaurant', 'kalzone']],
  ['Roupas e beleza', ['renner', 'riachuelo', ' cea ', 'c&a', 'zara', 'hering', 'centauro', 'netshoes', 'decathlon', 'havaianas', 'salao', 'cabeleir', 'barbearia', 'boticario', 'natura', 'sephora', 'avon', 'eudora', 'manicure', 'estetica', 'perfumaria']],
  ['Lazer', ['cinema', 'cinemark', 'kinoplex', 'ingresso', 'sympla', 'eventim', 'ticketmaster', 'teatro', 'show ', 'parque', 'steam', 'playstation', 'xbox', 'nintendo', 'roblox', 'riot', 'epic games', 'boliche', 'livraria cultura']],
  ['Saúde e bem-estar', ['farmacia', 'drogaria', 'droga raia', 'drogasil', 'pague menos', 'panvel', 'hospital', 'clinica', 'laboratorio', 'unimed', 'amil', 'hapvida', 'dentista', 'odonto', 'psicolog', 'smartfit', 'smart fit', 'bluefit', 'academia', 'totalpass', 'gympass', 'wellhub']],
  ['Contas da casa', ['enel', 'light s', 'sabesp', 'cemig', 'copel', 'cpfl', 'coelba', 'celpe', 'comgas', 'naturgy', 'vivo', 'claro', ' tim ', 'oi fibra', 'net servicos', 'internet', 'condominio', 'aluguel', 'energia', 'saneamento', 'quintoandar', 'quinto andar', 'imobiliaria', 'cond do edif', 'edif resid', 'companhia paulista de for', 'vero s.a', ' gas ', 'ultragaz', 'liquigas', 'supergasbras']],
  ['Educação', ['escola', 'colegio', 'faculdade', 'universidade', 'curso', 'udemy', 'alura', 'coursera', 'duolingo', 'preply', 'cambly','livraria', 'papelaria', 'kalunga']],
  ['Viagem', ['airbnb', 'booking', 'hotel', 'pousada', 'latam', ' gol ', 'gol linhas', 'azul linhas', 'decolar', '123milhas', 'rodoviaria', 'buser', 'clickbus', 'real expresso', 'viacao', 'cometa', 'expresso de prata']],
  ['Pets', ['petz', 'cobasi', 'petshop', 'pet shop', 'veterinari', 'petlove', 'pet love', '+vet', ' vet ', 'agropet', 'pet center']],
  ['Pix e transferências', ['pix', 'transferencia', ' ted ', ' doc ', 'transf ']],
];

function normalizar(texto) {
  return ' ' + String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[*_\-/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}

// "Chave" do estabelecimento: a descrição sem números (datas, parcelas, códigos).
// É usada para aprender com as suas correções: corrigiu um "IFD*BURGUER X",
// as próximas compras nesse lugar vão para a mesma categoria.
function chaveDoEstabelecimento(descricao) {
  return normalizar(descricao).replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Decide a categoria de uma transação.
 * @param {object} t  transação já no formato do app (descricao, direcao, tipoConta, tipoOperacao)
 * @param {object} aprendidas  { chave: categoria } vindas das suas correções
 * @param {boolean} temCartaoConectado  se existe uma conta de cartão de crédito conectada
 */
// Pix/TED para você mesma (o nome do titular das contas aparece na descrição).
// Os bancos às vezes cortam o nome no fim, então também vale o começo do nome (12+ letras) no fim da descrição.
function ehParaMimMesma(descricao, titulares) {
  if (!titulares || !titulares.length) return false;
  const texto = normalizar(descricao).trim();
  if (!/\b(pix|ted|doc|transf)/.test(texto)) return false;
  return titulares.some((nome) => {
    const n = normalizar(nome).trim();
    if (n.length < 8) return false;
    if (texto.includes(n)) return true;
    for (let tam = n.length - 1; tam >= 12; tam--) {
      if (texto.endsWith(' ' + n.slice(0, tam))) return true;
    }
    return false;
  });
}

function categorizar(t, aprendidas, temCartaoConectado, regras, titulares) {
  const texto = normalizar(t.descricao);

  // 1º: as suas regras ("se tiver 'maria rosa' no nome, é Saúde").
  // Uma entrada que cai numa categoria de gasto (ex.: Pix das meninas → Contas da casa)
  // é descontada dessa categoria e do total de gastos.
  const minha = regraQueBate(t.descricao, regras, t.direcao);
  if (minha) return minha.categoria;

  // 2º: o que o app aprendeu com as suas correções.
  const chave = chaveDoEstabelecimento(t.descricao);
  if (aprendidas && aprendidas[chave]) return aprendidas[chave];

  // 3º: dinheiro indo/vindo de uma conta sua não é gasto nem entrada.
  if (ehParaMimMesma(t.descricao, titulares)) return 'Transferência entre minhas contas';

  const op = String(t.tipoOperacao || '').toUpperCase();

  if (op === 'PAGAMENTO_FATURA') return 'Pagamento de fatura';
  if (op === 'ESTORNO' || op === 'CASHBACK') return 'Estornos e reembolsos';
  if (op === 'TARIFA') return 'Tarifas e juros';

  let encontrada = null;
  for (const [categoria, palavras] of REGRAS) {
    if (palavras.some((p) => texto.includes(p))) { encontrada = categoria; break; }
  }

  // Investimentos e transferências entre suas contas valem para entrada e saída.
  if (encontrada === 'Transferência entre minhas contas' || encontrada === 'Investimentos') return encontrada;

  if (t.direcao === 'entrada') {
    if (encontrada === 'Estornos e reembolsos') return encontrada;
    // Pagamento da fatura aparecendo no cartão (como crédito) nunca é gasto.
    if (encontrada === 'Pagamento de fatura' || t.tipoConta === 'CREDIT') {
      return encontrada === 'Pagamento de fatura' ? encontrada : 'Estornos e reembolsos';
    }
    return 'Entradas';
  }

  if (encontrada === 'Pagamento de fatura') {
    // Se o cartão está conectado, as compras dele já são contadas uma a uma,
    // então o pagamento da fatura na conta não pode contar de novo.
    // Se não está, o pagamento da fatura é o único registro desses gastos.
    return temCartaoConectado ? 'Pagamento de fatura' : 'Cartão de crédito';
  }
  if (encontrada === 'Estornos e reembolsos') return 'Outros';
  return encontrada || 'Outros';
}

function textoDaRegra(texto) {
  return normalizar(texto).trim();
}

// Uma regra pode valer só quando você RECEBE (entrada), só quando ENVIA/GASTA (saida) ou nos dois casos.
// Ex.: Pix recebido das meninas → Contas da casa (desconta da casa); Pix enviado para elas continua sendo Pix.
const DIRECOES_REGRA = ['ambas', 'entrada', 'saida'];

function regraValeParaDirecao(r, direcao) {
  return !r.direcao || r.direcao === 'ambas' || !direcao || r.direcao === direcao;
}

function regraQueBate(descricao, regras, direcao) {
  if (!regras || !regras.length) return null;
  const texto = normalizar(descricao);
  let melhor = null;
  let melhorPeso = -1;
  for (const r of regras) {
    if (!regraValeParaDirecao(r, direcao)) continue;
    const trecho = textoDaRegra(r.texto);
    if (!trecho || !texto.includes(trecho)) continue;
    // Texto mais longo ganha; empate: a regra com direção específica ganha da "ambas".
    const peso = trecho.length * 2 + (r.direcao && r.direcao !== 'ambas' ? 1 : 0);
    if (peso > melhorPeso) { melhor = r; melhorPeso = peso; }
  }
  return melhor;
}

// Categorias que mudaram de nome ou foram juntadas (para atualizar regras, limites e correções antigas).
const RENOMEADAS = { 'Delivery': 'Restaurantes', 'Restaurantes e lanches': 'Restaurantes', 'Seguros': 'Transporte' };

module.exports = { RENOMEADAS, CATEGORIAS, DIRECOES_REGRA, categorizar, chaveDoEstabelecimento, textoDaRegra, regraQueBate };

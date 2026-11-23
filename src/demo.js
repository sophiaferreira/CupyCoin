// Dados fictícios para você ver o app funcionando antes de conectar seus bancos.

const { bancoVazio } = require('./banco');
const { aplicarCategorias } = require('./sincronizar');

function gerador(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function gerarDemonstracao() {
  const aleatorio = gerador(42);
  const entre = (a, b) => Math.round((a + aleatorio() * (b - a)) * 100) / 100;
  const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];

  const banco = bancoVazio();
  banco.demo = true;
  banco.contas = {
    'demo-conta': { id: 'demo-conta', itemId: 'demo', nome: 'Conta corrente (exemplo)', tipo: 'BANK', subtipo: 'CHECKING_ACCOUNT', saldo: 2340.55 },
    'demo-cartao': { id: 'demo-cartao', itemId: 'demo', nome: 'Cartão de crédito (exemplo)', tipo: 'CREDIT', subtipo: 'CREDIT_CARD', saldo: 1180.2, limiteDisponivel: 3819.8 },
  };
  banco.itens = { demo: { id: 'demo', status: 'UPDATED', consentimentoExpiraEm: null } };
  banco.limites = { Restaurantes: 500, Lazer: 200 };

  let n = 0;
  const add = (contaId, data, descricao, valor, direcao, extra = {}) => {
    const conta = banco.contas[contaId];
    const id = 'demo-' + (++n);
    banco.transacoes[id] = {
      id, contaId, descricao, valor, moeda: 'BRL', direcao, data,
      pendente: false, parcela: null, tipoOperacao: null, tipoConta: conta.tipo, ...extra,
    };
  };

  const hoje = new Date();
  for (let m = 5; m >= 0; m--) {
    const ano = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1).getFullYear();
    const mes = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1).getMonth();
    const ultimoDia = m === 0 ? hoje.getDate() : new Date(ano, mes + 1, 0).getDate();
    const dia = (d) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`;
    const diaAleatorio = () => dia(1 + Math.floor(aleatorio() * ultimoDia));

    add('demo-conta', dia(5), 'SALARIO EMPRESA EXEMPLO LTDA', 3200, 'entrada');
    if (aleatorio() > 0.5) add('demo-conta', diaAleatorio(), 'PIX RECEBIDO - MAE', entre(50, 200), 'entrada');
    if (ultimoDia >= 10) add('demo-conta', dia(10), 'PAGAMENTO DE FATURA CARTAO', entre(900, 1500), 'saida');
    if (ultimoDia >= 8) add('demo-conta', dia(8), 'ENEL DISTRIBUICAO SP', entre(110, 180), 'saida');
    if (ultimoDia >= 12) add('demo-conta', dia(12), 'VIVO FIBRA INTERNET', 119.9, 'saida');
    add('demo-conta', diaAleatorio(), 'PIX ENVIADO - JULIA COSTA', entre(20, 80), 'saida');
    if (ultimoDia >= 14) add('demo-conta', dia(14), 'PIX ENVIADO - MARIA ROSA SILVA', 180, 'saida');
    add('demo-cartao', diaAleatorio(), 'CANTINHO DA DONA ANA', entre(18, 35), 'saida');
    add('demo-conta', diaAleatorio(), 'TARIFA PACOTE SERVICOS', 19.9, 'saida');

    add('demo-cartao', dia(3), 'NETFLIX.COM', 44.9, 'saida');
    add('demo-cartao', dia(7), 'SPOTIFY', 21.9, 'saida');
    add('demo-cartao', dia(15), 'SMARTFIT MENSALIDADE', 119.9, 'saida');

    const compras = [
      [6, 9, ['IFD*IFOOD BURGER KING', 'IFD*IFOOD SUSHI DA VILA', 'IFD*IFOOD MADERO', 'RAPPI*RESTAURANTE'], 28, 75],
      [3, 6, ['UBER *TRIP', '99APP *99POP', 'UBER *TRIP HELP.UBER.COM'], 12, 38],
      [2, 4, ['CARREFOUR HIPER', 'PAO DE ACUCAR-1234', 'ASSAI ATACADISTA', 'HORTIFRUTI CENTRAL'], 60, 260],
      [2, 5, ['STARBUCKS SHOPPING', 'PADARIA BELLA VISTA', 'MCDONALDS', 'ACAI DO PORTO'], 14, 55],
      [0, 2, ['DROGASIL 0456', 'DROGA RAIA'], 18, 90],
      [0, 2, ['CINEMARK', 'SYMPLA *SHOW', 'STEAM PURCHASE'], 30, 120],
      [0, 2, ['SHOPEE *LOJA', 'AMAZON MARKETPLACE', 'MERCADOLIVRE*VENDEDOR'], 35, 180],
      [0, 1, ['RENNER LOJA 22', 'BOTICARIO', 'ZARA BRASIL'], 70, 220],
      [0, 1, ['PETZ SHOPPING', 'COBASI'], 40, 130],
      [0, 1, ['LOJA DE CONVENIENCIA XYZ'], 10, 40],
    ];
    for (const [min, max, nomes, vMin, vMax] of compras) {
      const qtd = min + Math.floor(aleatorio() * (max - min + 1));
      for (let i = 0; i < qtd; i++) add('demo-cartao', diaAleatorio(), escolher(nomes), entre(vMin, vMax), 'saida');
    }
    if (m <= 2) {
      add('demo-cartao', dia(18), 'MAGALU FONE BLUETOOTH', 89.9, 'saida', { parcela: `${3 - m}/3` });
    }
  }

  aplicarCategorias(banco);
  banco.ultimaSincronizacao = new Date().toISOString();
  return banco;
}

module.exports = { gerarDemonstracao };

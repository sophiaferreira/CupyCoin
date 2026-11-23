// Busca as novidades na Pluggy e junta com o que já está salvo.

const pluggy = require('./pluggy');
const { categorizar } = require('./categorias');

const DIAS_REVISAR = 45; // revisa os últimos 45 dias (compras pendentes que viram confirmadas etc.)

// A Pluggy manda datas em UTC. Quando a hora é 00:00 exata, ela representa só o dia.
// Nos outros casos, convertemos para o horário de Brasília.
function dataLocal(iso) {
  if (!iso) return null;
  if (/T00:00:00(\.000)?Z$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

function converterTransacao(t, conta) {
  let direcao;
  if (t.type === 'CREDIT') direcao = 'entrada';
  else if (t.type === 'DEBIT') direcao = 'saida';
  else if (conta.type === 'CREDIT') direcao = t.amount >= 0 ? 'saida' : 'entrada'; // no cartão, positivo = compra
  else direcao = t.amount < 0 ? 'saida' : 'entrada';

  const meta = t.creditCardMetadata || {};
  const parcela = meta.totalInstallments > 1 ? `${meta.installmentNumber || '?'}/${meta.totalInstallments}` : null;

  return {
    id: t.id,
    contaId: t.accountId || conta.id,
    descricao: t.description || t.descriptionRaw || '(sem descrição)',
    valor: Math.abs(Number(t.amount) || 0),
    moeda: t.currencyCode || 'BRL',
    direcao,
    data: dataLocal(t.date),
    pendente: t.status === 'PENDING',
    parcela,
    tipoOperacao: t.operationType || null,
    tipoConta: conta.type,
  };
}

function numero(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function converterInvestimento(i, itemId) {
  const saldo = numero(i.balance) ?? numero(i.amount) ?? 0;
  const aplicado = numero(i.amountOriginal);
  const lucro = numero(i.amountProfit) ?? (aplicado !== null && saldo ? saldo - aplicado : null);
  return {
    id: i.id,
    itemId,
    nome: i.name || i.code || 'Investimento',
    tipo: i.type || null, // FIXED_INCOME, MUTUAL_FUND, EQUITY, ETF, SECURITY, COE, OTHER
    subtipo: i.subtype || null, // CDB, LCI, LCA, TESOURO...
    emissor: i.issuer || null,
    saldo,
    aplicado,
    lucro,
    taxa: numero(i.rate),
    indexador: i.rateType || null, // CDI, IPCA, SELIC...
    taxaFixaAnual: numero(i.fixedAnnualRate),
    vencimento: i.dueDate ? dataLocal(i.dueDate) : null,
    compra: i.purchaseDate ? dataLocal(i.purchaseDate) : null,
    status: i.status || 'ACTIVE', // ACTIVE, PENDING, TOTAL_WITHDRAWAL
    atualizadoEm: i.date || null,
  };
}

function aplicarCategorias(banco) {
  const temCartao = Object.values(banco.contas).some((c) => c.tipo === 'CREDIT');
  const titulares = [...new Set(Object.values(banco.contas).map((c) => c.titular).filter(Boolean))];
  for (const t of Object.values(banco.transacoes)) {
    if (t.categoriaManual) continue;
    t.categoria = categorizar(t, banco.aprendidas, temCartao, banco.regras, titulares);
  }
}

async function sincronizar(banco, config) {
  const apiKey = await pluggy.autenticar(config.clientId, config.clientSecret);
  const primeiraVez = !banco.ultimaSincronizacao;
  let dataInicio = null;
  if (!primeiraVez) {
    const d = new Date(banco.ultimaSincronizacao);
    d.setDate(d.getDate() - DIAS_REVISAR);
    dataInicio = d.toISOString().slice(0, 10);
  }

  const avisos = [];
  let novas = 0;

  for (const itemId of config.itemIds) {
    const item = await pluggy.buscarItem(apiKey, itemId);
    banco.itens[itemId] = {
      id: itemId,
      status: item.status,
      statusExecucao: item.executionStatus,
      consentimentoExpiraEm: item.consentExpiresAt || null,
      atualizadoNaPluggyEm: item.lastUpdatedAt || null,
      proximaAtualizacao: item.nextAutoSyncAt || null,
      erro: item.error ? (item.error.message || item.error.code) : null,
    };

    const contas = await pluggy.buscarContas(apiKey, itemId);
    for (const c of contas) {
      banco.contas[c.id] = {
        id: c.id,
        itemId,
        nome: c.marketingName || c.name || 'Conta',
        tipo: c.type, // BANK ou CREDIT
        subtipo: c.subtype,
        saldo: c.balance,
        titular: typeof c.owner === 'string' ? c.owner : (c.owner && c.owner.name) || null,
        limiteDisponivel: c.creditData ? c.creditData.availableCreditLimit : null,
      };

      const recebidas = await pluggy.buscarTransacoes(apiKey, c.id, dataInicio);
      const idsRecebidos = new Set();
      for (const bruta of recebidas) {
        const t = converterTransacao(bruta, c);
        idsRecebidos.add(t.id);
        const existente = banco.transacoes[t.id];
        if (!existente) novas++;
        banco.transacoes[t.id] = existente
          ? { ...existente, ...t, categoria: existente.categoria, categoriaManual: existente.categoriaManual }
          : t;
      }

      // Transações que sumiram da Pluggy dentro da janela revisada (ex.: compra pendente cancelada).
      // Só apaga se a conexão está saudável e veio alguma coisa, para nunca apagar tudo por engano.
      if (dataInicio && item.status === 'UPDATED' && recebidas.length > 0) {
        for (const t of Object.values(banco.transacoes)) {
          if (t.contaId === c.id && t.data >= dataInicio && !idsRecebidos.has(t.id)) {
            delete banco.transacoes[t.id];
          }
        }
      }
    }

    // Investimentos: a Pluggy manda a foto atual de cada um (saldo, quanto foi aplicado, taxa, vencimento).
    try {
      const invs = await pluggy.buscarInvestimentos(apiKey, itemId);
      banco.investimentos = banco.investimentos || {};
      for (const id of Object.keys(banco.investimentos)) if (banco.investimentos[id].itemId === itemId) delete banco.investimentos[id];
      for (const i of invs) banco.investimentos[i.id] = converterInvestimento(i, itemId);
    } catch (e) {
      console.warn('Não consegui buscar investimentos:', e.message);
    }

    if (item.status && item.status !== 'UPDATED' && item.status !== 'UPDATING') {
      avisos.push(`Uma conexão está com status "${item.status}"${item.error ? `: ${item.error.message || item.error.code}` : ''}. Talvez seja preciso reconectar no Meu Pluggy.`);
    }
  }

  aplicarCategorias(banco);
  banco.ultimaSincronizacao = new Date().toISOString();
  banco.ultimoErro = null;
  return { novas, avisos };
}

module.exports = { sincronizar, aplicarCategorias, dataLocal };

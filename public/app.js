'use strict';

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dinheiro = (v) => brl.format(v || 0);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function chaveMes(ano, mes) { return `${ano}-${String(mes + 1).padStart(2, '0')}`; }
function mesDe(data) { return data ? data.slice(0, 7) : ''; }
function somarMes(ano, mes, delta) { const d = new Date(ano, mes + delta, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; }
function nomeMes(ano, mes) { return `${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)} de ${ano}`; }

// Mesma regra do servidor para reconhecer "o mesmo estabelecimento".
function chaveDoEstabelecimento(descricao) {
  return (' ' + String(descricao || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[*_\-/\\|]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ')
    .replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Mesma regra do servidor para as "Minhas regras": o nome contém o texto?
function normalizarRegra(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[*_\-/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function bateComRegra(t, texto, direcao) {
  if (direcao && direcao !== 'ambas' && t.direcao !== direcao) return false;
  const trecho = normalizarRegra(texto);
  return trecho.length >= 3 && (' ' + normalizarRegra(t.descricao) + ' ').includes(trecho);
}
const OPCOES_DIRECAO = [
  ['entrada', 'eu RECEBER dinheiro'],
  ['saida', 'eu PAGAR ou ENVIAR'],
  ['ambas', 'receber ou pagar'],
];
function opcoesDeDirecao(selecionada) {
  return OPCOES_DIRECAO.map(([v, txt]) => `<option value="${v}" ${v === selecionada ? 'selected' : ''}>${txt}</option>`).join('');
}
function textoDirecao(d) {
  return d === 'entrada' ? 'Receber' : d === 'saida' ? 'Pagar/enviar' : 'Receber ou pagar';
}
// Sugestão de texto para a regra: tira "PIX ENVIADO", números, CPF mascarado etc.
function sugerirTextoDaRegra(descricao) {
  return String(descricao || '')
    .replace(/\b(pix|ted|doc|transf\w*|enviad[oa]|recebid[oa]|pagamento|pgto|compra|debito|credito|no|na|pelo|para|de)\b/gi, ' ')
    .replace(/[•*.\d\-\/|:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tempoRelativo(iso) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

// ---------- Estado ----------
let estado = null;
let cats = {};
const hoje = new Date();
let atual = { ano: hoje.getFullYear(), mes: hoje.getMonth() };

async function api(caminho, corpo) {
  const resp = await fetch(caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
  // Sessão expirou (versão da internet): volta para a tela de senha.
  if (resp.status === 401) { location.reload(); return new Promise(() => {}); }
  return resp.json();
}

async function carregar() {
  try {
    receber(await api('/api/estado'));
  } catch (e) {
    $('#avisos').innerHTML = `<div class="aviso erro"><span>⚠️</span><div><strong>Não consegui falar com o app.</strong>Ele está aberto? Dê dois cliques em <code>iniciar.bat</code> e recarregue a página.</div></div>`;
    return;
  }
  if (estado.precisaAtualizar) atualizar(true);
}

function receber(novo) {
  estado = novo;
  cats = Object.fromEntries(estado.categorias.map((c) => [c.nome, c]));
  desenhar();
}

async function atualizar(silencioso) {
  const botao = $('#btn-atualizar');
  botao.disabled = true;
  $('#status').textContent = 'Buscando novidades nos bancos…';
  try {
    const r = await api('/api/sincronizar', {});
    receber(r.estado);
    if (!r.ok) mostrarToast('Não deu para atualizar: ' + r.erro);
    else if (r.demo) { if (!silencioso) mostrarToast('Modo demonstração: conecte seus bancos para atualizar de verdade.'); }
    else {
      mostrarToast(r.novas ? `Pronto! ${r.novas} transação(ões) nova(s).` : 'Tudo em dia, nada novo.');
      (r.avisos || []).forEach((a) => mostrarToast(a));
    }
  } catch (e) {
    mostrarToast('Não consegui falar com o app. Ele ainda está aberto?');
  } finally {
    botao.disabled = false;
    desenharStatus();
  }
}

// ---------- Cálculos ----------
// Quanto uma transação pesa nos gastos e nas entradas.
function pesos(t) {
  const c = cats[t.categoria] || {};
  if (c.ignorar || c.investimento) return { gasto: 0, entrada: 0 };
  const sinal = t.direcao === 'saida' ? 1 : -1;
  if (c.entrada) return { gasto: 0, entrada: -sinal * t.valor };
  return { gasto: sinal * t.valor, entrada: 0 };
}

function resumoDoMes(chave, ateDia) {
  let gastos = 0, entradas = 0;
  const porCategoria = {}; // gasto líquido (já com os descontos)
  const descontos = {}; // dinheiro que voltou para a categoria (ex.: Pix das meninas na casa)
  let totalDescontos = 0;
  for (const t of estado.transacoes) {
    if (mesDe(t.data) !== chave) continue;
    if (ateDia && Number(t.data.slice(8, 10)) > ateDia) continue;
    const p = pesos(t);
    gastos += p.gasto;
    entradas += p.entrada;
    if (p.gasto) porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + p.gasto;
    if (p.gasto < 0) {
      descontos[t.categoria] = (descontos[t.categoria] || 0) - p.gasto;
      totalDescontos -= p.gasto;
    }
  }
  return { gastos, entradas, porCategoria, descontos, totalDescontos };
}

function limitesDeMeses() {
  const meses = estado.transacoes.map((t) => mesDe(t.data)).filter(Boolean).sort();
  const hojeChave = chaveMes(hoje.getFullYear(), hoje.getMonth());
  return { min: meses[0] || hojeChave, max: [meses[meses.length - 1] || hojeChave, hojeChave].sort().pop() };
}

// ---------- Desenho ----------
function desenhar() {
  desenharStatus();
  desenharAvisos();
  desenharMes();
  const chave = chaveMes(atual.ano, atual.mes);
  const ehMesAtual = chave === chaveMes(hoje.getFullYear(), hoje.getMonth());
  const resumo = resumoDoMes(chave);
  const ant = somarMes(atual.ano, atual.mes, -1);
  const resumoAnt = resumoDoMes(chaveMes(ant.ano, ant.mes), ehMesAtual ? hoje.getDate() : null);
  desenharKpis(resumo, resumoAnt, ehMesAtual);
  desenharInsights(resumo, resumoDoMes(chaveMes(ant.ano, ant.mes)), ehMesAtual);
  desenharCategorias(resumo);
  desenharHistorico();
  desenharInvestimentos(resumoInvestimentosDoMes(chave));
  desenharPainel();
  desenharRegras();
}

function opcoesDeCategoria(selecionada) {
  return estado.categorias.map((c) => `<option value="${esc(c.nome)}" ${c.nome === selecionada ? 'selected' : ''}>${c.emoji} ${esc(c.nome)}</option>`).join('');
}

function desenharRegras() {
  const sel = $('#regra-categoria');
  const anterior = sel.value || 'Saúde e bem-estar';
  sel.innerHTML = opcoesDeCategoria(anterior);
  atualizarPreviaRegra();
  const regras = estado.regras || [];
  if (!regras.length) {
    $('#regras').innerHTML = '<div class="vazio">Nenhuma regra ainda. Exemplo: “maria rosa” → Saúde e bem-estar.</div>';
    return;
  }
  $('#regras').innerHTML = regras.map((r) => {
    const qtd = estado.transacoes.filter((t) => bateComRegra(t, r.texto, r.direcao)).length;
    const desconta = r.direcao === 'entrada' && !cats[r.categoria]?.entrada && !cats[r.categoria]?.ignorar && !cats[r.categoria]?.investimento;
    return `<div class="regra">
      <span class="pill-direcao">${textoDirecao(r.direcao)}</span>
      <span>com <span class="regra-texto">“${esc(r.texto)}”</span></span>
      <span class="regra-seta">→</span>
      <span>${cats[r.categoria]?.emoji || ''} ${esc(r.categoria)}${desconta ? ' <span class="regra-desconta">(desconta dos gastos)</span>' : ''}</span>
      <span class="regra-qtd">${qtd} transação(ões)</span>
      <button class="botao-link" data-remover="${esc(r.id)}" aria-label="Remover regra ${esc(r.texto)}">Remover</button>
    </div>`;
  }).join('');
}

function atualizarPreviaRegra() {
  $('#regra-previa').innerHTML = textoDaPrevia($('#regra-texto').value, $('#regra-direcao').value, $('#regra-categoria').value);
}

function textoDaPrevia(texto, direcao, categoria) {
  if (normalizarRegra(texto).length < 3) return '';
  const achadas = estado.transacoes.filter((t) => bateComRegra(t, texto, direcao));
  const desconta = direcao === 'entrada' && categoria && !cats[categoria]?.entrada && !cats[categoria]?.ignorar && !cats[categoria]?.investimento;
  const explicacao = desconta
    ? `<br>💡 O dinheiro que chegar com esse nome vai ser <b>descontado</b> de ${esc(categoria)} e do total de gastos.`
    : '';
  if (!achadas.length) return 'Nenhuma transação com esse texto até agora. A regra vai valer para as próximas.' + explicacao;
  const total = achadas.reduce((s, t) => s + t.valor, 0);
  const exemplos = [...new Set(achadas.map((t) => t.descricao))].slice(0, 3).map(esc).join(' · ');
  return `Vai valer para <b>${achadas.length}</b> transação(ões) (${dinheiro(total)} no total), ex.: ${exemplos}` + explicacao;
}

async function criarRegra(texto, categoria, direcao) {
  const r = await api('/api/regras', { texto, categoria, direcao });
  if (r.erro) { mostrarToast(r.erro); return false; }
  receber(r.estado);
  mostrarToast(`Regra criada! ${r.afetadas} transação(ões) foram para ${categoria}.`);
  return true;
}

async function abrirDialogoRegra(descricao, categoria, direcao) {
  const sugestao = sugerirTextoDaRegra(descricao);
  const escolha = await abrirDialogo(
    'Criar regra',
    `<p>Deixe só a parte do nome que sempre aparece. Ex.: em “PIX ENVIADO - MARIA ROSA SILVA”, use <b>maria rosa</b>.</p>
     <div class="dialogo-regra">
       <label for="dlg-regra-dir">Quando</label>
       <select id="dlg-regra-dir">${opcoesDeDirecao(direcao || 'ambas')}</select>
       <label for="dlg-regra-texto">e o nome tiver</label>
       <input class="campo" id="dlg-regra-texto" type="text" maxlength="80" value="${esc(sugestao)}">
       <label for="dlg-regra-cat">vai para a categoria</label>
       <select id="dlg-regra-cat">${opcoesDeCategoria(categoria)}</select>
       <div class="regra-previa" id="dlg-regra-previa"></div>
     </div>`,
    [
      { texto: 'Cancelar', valor: null, secundario: true },
      { texto: 'Criar regra', valor: 'criar' },
    ],
    () => {
      const previa = () => {
        const html = textoDaPrevia($('#dlg-regra-texto').value, $('#dlg-regra-dir').value, $('#dlg-regra-cat').value);
        $('#dlg-regra-previa').innerHTML = html || 'Escreva pelo menos 3 letras.';
      };
      ['#dlg-regra-texto', '#dlg-regra-dir', '#dlg-regra-cat'].forEach((s) => {
        $(s).addEventListener('input', previa);
        $(s).addEventListener('change', previa);
      });
      previa();
    },
  );
  if (escolha !== 'criar') return false;
  return criarRegra($('#dlg-regra-texto').value, $('#dlg-regra-cat').value, $('#dlg-regra-dir').value);
}

function desenharStatus() {
  if (!estado) return;
  const el = $('#status');
  $('#btn-sair').hidden = !estado.podeSair;
  if (estado.demo) el.innerHTML = '<span class="selo">Demonstração</span>dados fictícios';
  else el.textContent = `Atualizado ${tempoRelativo(estado.ultimaSincronizacao)}`;
}

function desenharAvisos() {
  const avisos = [];
  if (estado.demo) {
    avisos.push(`<div class="aviso alerta"><span>👋</span><div><strong>Você está vendo dados de exemplo.</strong>
      Para ver os seus gastos de verdade, siga o passo a passo do arquivo <code>LEIA-ME.md</code> (na pasta do app) e preencha o
      <code>configuracao.env</code>. Depois é só clicar em “Atualizar agora”.</div></div>`);
  }
  if (estado.ultimoErro) {
    avisos.push(`<div class="aviso erro"><span>⚠️</span><div><strong>A última atualização falhou (${esc(tempoRelativo(estado.ultimoErro.em))}).</strong>${esc(estado.ultimoErro.mensagem)}</div></div>`);
  }
  for (const item of estado.itens || []) {
    if (!item.consentimentoExpiraEm) continue;
    const dias = Math.ceil((new Date(item.consentimentoExpiraEm) - Date.now()) / 86400000);
    if (dias <= 0) {
      avisos.push(`<div class="aviso erro"><span>🔒</span><div><strong>A autorização de um banco venceu.</strong>Entre no Dashboard da Pluggy e conecte o MeuPluggy de novo (veja “Renovar a autorização” no LEIA-ME).</div></div>`);
    } else if (dias <= 30) {
      avisos.push(`<div class="aviso alerta"><span>⏳</span><div><strong>A autorização de um banco vence em ${dias} dia(s).</strong>Renove antes para não parar de atualizar (veja “Renovar a autorização” no LEIA-ME).</div></div>`);
    }
  }
  if (!estado.demo && !estado.transacoes.length && !estado.ultimoErro) {
    avisos.push(`<div class="aviso"><span>⏳</span><div><strong>Buscando seus dados pela primeira vez…</strong>Pode levar um minutinho.</div></div>`);
  }
  $('#avisos').innerHTML = avisos.join('');
}

function desenharMes() {
  const { min, max } = limitesDeMeses();
  const chave = chaveMes(atual.ano, atual.mes);
  $('#mes-titulo').textContent = nomeMes(atual.ano, atual.mes);
  $('#mes-anterior').disabled = chave <= min;
  $('#mes-seguinte').disabled = chave >= max;
}

function desenharKpis(r, ant, ehMesAtual) {
  let comparacao = '';
  if (ant.gastos > 0) {
    const pct = Math.round(((r.gastos - ant.gastos) / ant.gastos) * 100);
    const quando = ehMesAtual ? 'no mesmo período do mês passado' : 'que no mês anterior';
    if (pct === 0) comparacao = `igual ${ehMesAtual ? 'ao mesmo período do mês passado' : 'ao mês anterior'}`;
    else comparacao = `<span class="${pct > 0 ? 'sobe' : 'desce'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> ${pct > 0 ? 'a mais' : 'a menos'} ${quando}`;
  }
  const sobrou = r.entradas - r.gastos;
  const maior = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1])[0];
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="kpi-rotulo">Gastos do mês</div><div class="kpi-valor num">${dinheiro(r.gastos)}</div><div class="kpi-extra">${comparacao || '&nbsp;'}</div></div>
    <button class="kpi kpi-clicavel" data-painel="entradas" aria-label="Ver entradas do mês"><div class="kpi-rotulo">Entradas <span class="cat-seta" aria-hidden="true">›</span></div><div class="kpi-valor num">${dinheiro(r.entradas)}</div><div class="kpi-extra">salário, Pix recebidos, estornos</div></button>
    <div class="kpi"><div class="kpi-rotulo">${sobrou >= 0 ? 'Sobrou' : 'Faltou'}</div><div class="kpi-valor num">${dinheiro(Math.abs(sobrou))}</div><div class="kpi-extra">entradas menos gastos</div></div>
    <div class="kpi"><div class="kpi-rotulo">Onde mais gastou</div><div class="kpi-valor" style="font-size:18px;padding-top:4px">${maior ? `${cats[maior[0]]?.emoji || ''} ${esc(maior[0])}` : '—'}</div><div class="kpi-extra num">${maior ? `${dinheiro(maior[1])} · ${Math.round((maior[1] / r.gastos) * 100)}% dos gastos` : '&nbsp;'}</div></div>`;
}

function desenharInsights(r, antCompleto, ehMesAtual) {
  const itens = [];
  // Limites
  for (const [cat, limite] of Object.entries(estado.limites || {})) {
    const gasto = r.porCategoria[cat] || 0;
    if (gasto > limite) itens.push(`🚨 Você passou do limite de <b>${esc(cat)}</b> em <b>${dinheiro(gasto - limite)}</b>`);
    else if (ehMesAtual && gasto >= limite * 0.8) itens.push(`⚠️ Já usou <b>${Math.round((gasto / limite) * 100)}%</b> do limite de <b>${esc(cat)}</b>`);
  }
  // Maior aumento em relação ao mês anterior (só para meses fechados, para ser justo)
  if (!ehMesAtual) {
    let melhor = null;
    for (const [cat, v] of Object.entries(r.porCategoria)) {
      const a = antCompleto.porCategoria[cat] || 0;
      if (a < 50) continue;
      const pct = (v - a) / a;
      if (pct > 0.2 && (!melhor || v - a > melhor.dif)) melhor = { cat, pct, dif: v - a };
    }
    if (melhor) itens.push(`📈 Você gastou <b>${Math.round(melhor.pct * 100)}% a mais</b> com <b>${esc(melhor.cat)}</b> que no mês anterior`);
  }
  // Dinheiro que voltou para categorias de gasto (ex.: Pix das meninas na casa)
  if (r.totalDescontos > 0) {
    const principal = Object.entries(r.descontos).sort((a, b) => b[1] - a[1])[0];
    itens.push(`↩️ Voltaram <b>${dinheiro(r.totalDescontos)}</b> pra você${principal ? `, a maior parte em <b>${esc(principal[0])}</b>` : ''}, e isso já foi descontado dos gastos`);
  }
  // Parcelas futuras
  const chave = chaveMes(atual.ano, atual.mes);
  const parcelasFuturas = estado.transacoes.filter((t) => t.parcela && mesDe(t.data) > chave && pesos(t).gasto > 0);
  if (ehMesAtual && parcelasFuturas.length) {
    const total = parcelasFuturas.reduce((s, t) => s + t.valor, 0);
    itens.push(`🗓️ Você tem <b>${dinheiro(total)}</b> em parcelas para os próximos meses`);
  }
  $('#insights').innerHTML = itens.slice(0, 4).map((i) => `<li>${i}</li>`).join('');
}

function desenharCategorias(r) {
  const nomes = new Set([...Object.keys(r.porCategoria), ...Object.keys(r.descontos), ...Object.keys(estado.limites || {})]);
  const linhas = [...nomes]
    .map((cat) => [cat, Math.max(0, r.porCategoria[cat] || 0)])
    .filter(([cat, v]) => v > 0.004 || r.descontos[cat] || estado.limites[cat])
    .sort((a, b) => b[1] - a[1]);

  const ignoradas = transacoesDoMes().filter((t) => cats[t.categoria]?.ignorar).length;
  const linkIgnoradas = ignoradas
    ? `<button class="link-discreto" data-painel="ignoradas">Ver o que não entra nos gastos (${ignoradas}) · faturas e transferências entre suas contas</button>`
    : '';

  if (!linhas.length) { $('#categorias').innerHTML = '<div class="vazio">Nenhum gasto neste mês.</div>' + linkIgnoradas; return; }

  const escala = Math.max(1, ...linhas.map(([c, v]) => Math.max(v, estado.limites[c] || 0)));
  $('#categorias').innerHTML = linhas.map(([cat, v]) => {
    const limite = estado.limites[cat];
    const passou = limite && v > limite;
    const desconto = r.descontos[cat] || 0;
    const partes = [];
    if (desconto) partes.push(`já descontado ${dinheiro(desconto)} que voltou`);
    if (limite) {
      partes.push(`<span class="${passou ? 'passou' : ''}">limite ${dinheiro(limite)}${passou ? ` · passou ${dinheiro(v - limite)}` : ` · faltam ${dinheiro(limite - v)}`}</span>`);
    } else if (!desconto && r.gastos > 0) {
      partes.push(`${Math.round((v / r.gastos) * 100)}% dos gastos`);
    }
    return `<button class="cat" data-cat="${esc(cat)}" aria-label="Ver gastos de ${esc(cat)}">
      <span class="cat-emoji" aria-hidden="true">${cats[cat]?.emoji || '📌'}</span>
      <span class="cat-nome">${esc(cat)}</span>
      <span class="cat-valor num">${dinheiro(v)} <span class="cat-seta" aria-hidden="true">›</span></span>
      <span class="cat-trilho">
        <span class="cat-barra ${passou ? 'passou' : ''}" style="display:block;width:${(v / escala) * 100}%"></span>
        ${limite ? `<span class="cat-limite" style="left:calc(${(limite / escala) * 100}% - 1px)" title="Limite"></span>` : ''}
      </span>
      <span class="cat-sub num">${partes.join(' · ')}</span>
    </button>`;
  }).join('') + linkIgnoradas;
}

function desenharHistorico() {
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(somarMes(atual.ano, atual.mes, -i));
  const valores = meses.map((m) => ({ ...m, valor: resumoDoMes(chaveMes(m.ano, m.mes)).gastos }));
  const max = Math.max(...valores.map((v) => v.valor), 1);
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;

  const L = 480, A = 240, mE = 8, mD = 8, mT = 22, mB = 26;
  const larguraUtil = L - mE - mD, alturaUtil = A - mT - mB;
  const slot = larguraUtil / valores.length;
  const largura = Math.min(44, slot * 0.6);

  let svg = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Gastos por mês nos últimos 6 meses">`;
  svg += `<line class="grade-linha" x1="${mE}" x2="${L - mD}" y1="${mT + alturaUtil}" y2="${mT + alturaUtil}"/>`;
  valores.forEach((v, i) => {
    const h = Math.max(v.valor > 0 ? 2 : 0, (v.valor / topo) * alturaUtil);
    const x = mE + slot * i + (slot - largura) / 2;
    const y = mT + alturaUtil - h;
    const r = Math.min(4, h / 2, largura / 2);
    const ehAtual = i === valores.length - 1;
    // Coluna com cantos arredondados só em cima, apoiada na base.
    svg += h > 0
      ? `<path class="coluna ${ehAtual ? 'atual' : ''}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + h} Z"/>`
      : '';
    if (ehAtual || v.valor === max) {
      svg += `<text class="rotulo-valor num" x="${x + largura / 2}" y="${y - 6}" text-anchor="middle">${brlCurto.format(v.valor)}</text>`;
    }
    svg += `<text class="eixo" x="${x + largura / 2}" y="${A - 6}" text-anchor="middle">${MESES_CURTOS[v.mes]}${v.mes === 0 || i === 0 ? ` ${String(v.ano).slice(2)}` : ''}</text>`;
    svg += `<rect class="alvo" x="${mE + slot * i}" y="${mT - 20}" width="${slot}" height="${alturaUtil + 20}" data-i="${i}"/>`;
  });
  svg += '</svg>';
  const el = $('#historico');
  el.innerHTML = `<div class="hist">${svg}</div>`;
  el.querySelectorAll('.alvo').forEach((alvo) => {
    const v = valores[Number(alvo.dataset.i)];
    alvo.addEventListener('mousemove', (e) => mostrarTooltip(e, `${nomeMes(v.ano, v.mes)}: ${dinheiro(v.valor)}`));
    alvo.addEventListener('mouseleave', esconderTooltip);
    alvo.addEventListener('click', () => { esconderTooltip(); atual = { ano: v.ano, mes: v.mes }; desenhar(); });
  });
}

// ---------- Investimentos ----------
const NOMES_TIPO = { FIXED_INCOME: 'Renda fixa', MUTUAL_FUND: 'Fundo', EQUITY: 'Ações', ETF: 'ETF', SECURITY: 'Previdência/título', COE: 'COE', OTHER: 'Outro' };
const dataCurta = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '');
let mostrarResgatados = false;

function resumoInvestimentosDoMes(chave) {
  let aportes = 0, resgates = 0;
  for (const t of estado.transacoes) {
    if (mesDe(t.data) !== chave || !cats[t.categoria]?.investimento) continue;
    if (t.direcao === 'saida') aportes += t.valor; else resgates += t.valor;
  }
  return { aportes, resgates };
}

function descricaoInvestimento(i) {
  const partes = [i.subtipo || NOMES_TIPO[i.tipo] || ''];
  if (i.taxa && i.indexador) {
    partes.push(i.indexador === 'CDI' || i.indexador === 'SELIC' ? `${i.taxa}% do ${i.indexador}` : `${i.indexador} + ${i.taxaFixaAnual ?? i.taxa}%`);
  } else if (i.taxaFixaAnual) {
    partes.push(`${i.taxaFixaAnual}% ao ano`);
  }
  if (i.vencimento) partes.push(`vence ${dataCurta(i.vencimento)}`);
  return partes.filter(Boolean).join(' · ');
}

function desenharInvestimentos(doMes) {
  const ativos = (estado.investimentos || [])
    .filter((i) => i.status !== 'TOTAL_WITHDRAWAL' && i.saldo > 0.004)
    .sort((a, b) => b.saldo - a.saldo);
  const resgatados = (estado.investimentos || []).filter((i) => i.status === 'TOTAL_WITHDRAWAL');
  const poupancas = estado.contas.filter((c) => c.subtipo === 'SAVINGS_ACCOUNT' && c.saldo > 0.004);
  const el = $('#investimentos');
  const cartao = el.closest('.cartao');
  if (!ativos.length && !poupancas.length && !resgatados.length && !doMes.aportes && !doMes.resgates) {
    cartao.hidden = true;
    return;
  }
  cartao.hidden = false;

  const total = ativos.reduce((s, i) => s + i.saldo, 0) + poupancas.reduce((s, c) => s + c.saldo, 0);
  const comLucro = ativos.filter((i) => typeof i.lucro === 'number');
  const lucro = comLucro.reduce((s, i) => s + i.lucro, 0);
  const aplicado = comLucro.reduce((s, i) => s + (i.aplicado || 0), 0);
  const pctLucro = aplicado > 0 ? ` (${((lucro / aplicado) * 100).toFixed(1).replace('.', ',')}%)` : '';

  let html = `<div class="inv-topo">
    <div>
      <div class="kpi-rotulo">Você tem investido</div>
      <div class="inv-total num">${dinheiro(total)}</div>
      ${comLucro.length ? `<div class="kpi-extra num">${lucro >= 0 ? '+' : '−'} ${dinheiro(Math.abs(lucro))} de rendimento bruto${pctLucro} sobre o que você aplicou (antes do imposto)</div>` : ''}
    </div>
    <button class="inv-mes" data-painel-inv aria-label="Ver movimentações de investimentos do mês">
      <div class="kpi-rotulo">Em ${MESES[atual.mes]} <span class="cat-seta" aria-hidden="true">›</span></div>
      <div class="num"><b>${dinheiro(doMes.aportes)}</b> investidos</div>
      <div class="num kpi-extra">${dinheiro(doMes.resgates)} resgatados</div>
    </button>
  </div>`;

  for (const i of ativos) {
    const lucroHtml = typeof i.lucro === 'number'
      ? `<div class="num inv-lucro ${i.lucro < 0 ? 'neg' : ''}">${i.lucro >= 0 ? '+' : '−'} ${dinheiro(Math.abs(i.lucro))}</div>`
      : '';
    html += `<div class="inv">
      <div class="tx-info"><div class="tx-desc">${esc(i.nome)}</div><div class="tx-meta">${esc(descricaoInvestimento(i))}</div></div>
      <div class="inv-valor"><div class="num"><b>${dinheiro(i.saldo)}</b></div>${lucroHtml}</div>
    </div>`;
  }
  for (const c of poupancas) {
    html += `<div class="inv">
      <div class="tx-info"><div class="tx-desc">Poupança</div><div class="tx-meta">${esc(c.nome.trim())}</div></div>
      <div class="inv-valor"><div class="num"><b>${dinheiro(c.saldo)}</b></div></div>
    </div>`;
  }
  if (resgatados.length) {
    html += `<button class="link-discreto" id="ver-resgatados">${mostrarResgatados ? 'Esconder' : 'Ver'} investimentos já resgatados (${resgatados.length})</button>`;
    if (mostrarResgatados) {
      html += resgatados.map((i) => `<div class="inv resgatado">
        <div class="tx-info"><div class="tx-desc">${esc(i.nome)}</div><div class="tx-meta">${esc(descricaoInvestimento(i))} · resgatado</div></div>
        <div class="inv-valor num">${i.aplicado ? `aplicou ${dinheiro(i.aplicado)}` : ''}</div>
      </div>`).join('');
    }
  }
  el.innerHTML = html;
}

// ---------- Painel (abre ao clicar numa categoria) ----------
// painel = { tipo: 'categoria', cat } | { tipo: 'entradas' } | { tipo: 'ignoradas' } | null
let painel = null;

function transacoesDoMes() {
  const chave = chaveMes(atual.ano, atual.mes);
  return estado.transacoes.filter((t) => mesDe(t.data) === chave);
}

function abrirPainel(novo) {
  painel = novo;
  desenharPainel();
  const dlg = $('#painel');
  if (!dlg.open) dlg.showModal();
  $('#painel-corpo').scrollTop = 0;
}

function desenharPainel() {
  if (!painel) return;
  const doMes = transacoesDoMes();
  const mes = nomeMes(atual.ano, atual.mes);
  let titulo, resumo = '', acoes = '', lista;

  if (painel.tipo === 'categoria') {
    const cat = painel.cat;
    lista = doMes.filter((t) => t.categoria === cat);
    const gastos = lista.filter((t) => t.direcao === 'saida').reduce((s, t) => s + t.valor, 0);
    const voltou = lista.filter((t) => t.direcao === 'entrada').reduce((s, t) => s + t.valor, 0);
    const liquido = gastos - voltou;
    const limite = estado.limites[cat];
    titulo = `${cats[cat]?.emoji || '📌'} ${cat}`;
    if (cats[cat]?.investimento) {
      lista = lista.filter((t) => t.valor > 0.004);
      resumo = `<div class="painel-total num">${dinheiro(gastos - voltou)}</div>
        <div class="painel-conta num">investiu ${dinheiro(gastos)} <span class="menos">· resgatou ${dinheiro(voltou)}</span></div>
        <div class="painel-conta">Dinheiro que foi pros investimentos (ou voltou deles). Não conta como gasto nem como entrada.</div>`;
      $('#painel-titulo').textContent = titulo;
      $('#painel-subtitulo').textContent = mes;
      $('#painel-resumo').innerHTML = resumo;
      $('#painel-lista').innerHTML = listaDeTransacoes(lista);
      return;
    }
    resumo = `<div class="painel-total num">${dinheiro(Math.max(0, liquido))}</div>`;
    if (voltou > 0) {
      resumo += `<div class="painel-conta num">${dinheiro(gastos)} gastos <span class="menos">− ${dinheiro(voltou)} que voltou</span></div>`;
    }
    if (limite) {
      const passou = liquido > limite;
      resumo += `<div class="painel-conta num ${passou ? 'passou' : ''}">Limite ${dinheiro(limite)} · ${passou ? `passou ${dinheiro(liquido - limite)}` : `faltam ${dinheiro(limite - liquido)}`}</div>`;
    }
    acoes = `<button class="botao secundario pequeno" id="painel-limite">${limite ? 'Mudar limite' : 'Definir limite mensal'}</button>`;
  } else if (painel.tipo === 'entradas') {
    lista = doMes.filter((t) => cats[t.categoria]?.entrada);
    const total = lista.reduce((s, t) => s + (t.direcao === 'entrada' ? t.valor : -t.valor), 0);
    titulo = '💰 Entradas';
    resumo = `<div class="painel-total num">${dinheiro(total)}</div>
      <div class="painel-conta">Dinheiro que chegou pra você. Pix que pagam uma conta (como a parte das meninas na casa) ficam na categoria da conta, descontando o gasto.</div>`;
  } else {
    lista = doMes.filter((t) => cats[t.categoria]?.ignorar);
    titulo = '🔁 Não entram nos gastos';
    resumo = `<div class="painel-conta">Pagamentos de fatura (as compras do cartão já foram contadas uma a uma) e dinheiro entre as suas próprias contas. Se algo aqui for um gasto de verdade, troque a categoria.</div>`;
  }

  $('#painel-titulo').textContent = titulo;
  $('#painel-subtitulo').textContent = mes;
  $('#painel-resumo').innerHTML = resumo + (acoes ? `<div class="painel-acoes">${acoes}</div>` : '');
  $('#painel-lista').innerHTML = listaDeTransacoes(lista);
}

function listaDeTransacoes(lista) {
  if (!lista.length) return '<div class="vazio">Nada aqui neste mês.</div>';
  lista = [...lista].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.valor - a.valor);
  const contas = Object.fromEntries(estado.contas.map((c) => [c.id, c]));
  let html = '';
  let diaAnterior = null;
  for (const t of lista) {
    if (t.data !== diaAnterior) {
      diaAnterior = t.data;
      const d = new Date(t.data + 'T12:00:00');
      html += `<div class="dia-titulo">${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;
    }
    const c = cats[t.categoria] || {};
    const conta = contas[t.contaId];
    const desconta = t.direcao === 'entrada' && !c.entrada && !c.ignorar && !c.investimento;
    const classe = c.ignorar ? 'ignorada' : (t.direcao === 'entrada' ? 'entrada' : '');
    const sinal = t.direcao === 'entrada' ? '+ ' : '';
    const pills = [
      t.parcela ? `<span class="pill">parcela ${esc(t.parcela)}</span>` : '',
      t.pendente ? '<span class="pill">pendente</span>' : '',
      desconta ? '<span class="pill pill-desconta">desconta do gasto</span>' : '',
    ].join('');
    html += `<div class="tx">
      <div class="tx-info">
        <div class="tx-desc" title="${esc(t.descricao)}">${esc(t.descricao)}</div>
        <div class="tx-meta">${conta ? `${conta.tipo === 'CREDIT' ? '💳' : '🏦'} ${esc(conta.nome.trim())}` : ''}${pills}</div>
      </div>
      <span class="tx-valor num ${classe}">${sinal}${dinheiro(t.valor)}</span>
      <select class="tx-cat" data-id="${esc(t.id)}" aria-label="Mudar categoria de ${esc(t.descricao)}">${opcoesDeCategoria(t.categoria)}</select>
    </div>`;
  }
  return html;
}

// ---------- Ações ----------
function abrirDialogo(titulo, corpoHtml, botoes, aoAbrir) {
  return new Promise((resolve) => {
    const dlg = $('#dialogo');
    $('#dialogo-titulo').textContent = titulo;
    $('#dialogo-corpo').innerHTML = corpoHtml;
    $('#dialogo-botoes').innerHTML = botoes.map((b, i) => `<button class="botao ${b.secundario ? 'secundario' : ''}" value="${i}">${esc(b.texto)}</button>`).join('');
    dlg.onclose = () => resolve(dlg.returnValue === '' ? null : botoes[Number(dlg.returnValue)]?.valor ?? null);
    dlg.returnValue = '';
    dlg.showModal();
    if (aoAbrir) aoAbrir();
    const campo = dlg.querySelector('input');
    if (campo) { campo.focus(); campo.select(); }
  });
}

async function mudarCategoria(select) {
  const t = estado.transacoes.find((x) => x.id === select.dataset.id);
  const nova = select.value;
  if (!t || nova === t.categoria) return;
  const chave = chaveDoEstabelecimento(t.descricao);
  const parecidas = estado.transacoes.filter((x) => x.id !== t.id && !x.categoriaManual && chaveDoEstabelecimento(x.descricao) === chave && x.categoria !== nova).length;
  const nome = esc(t.descricao);
  const escolha = await abrirDialogo(
    `Mudar para ${cats[nova]?.emoji || ''} ${nova}`,
    (parecidas
      ? `<p>Encontrei mais <b>${parecidas}</b> transação(ões) de <b>${nome}</b>. Quer mudar todas e mandar as próximas para cá também?</p>`
      : `<p>Quer que as próximas transações de <b>${nome}</b> também vão para esta categoria?</p>`)
      + `<p class="dica">Dica: o nome muda um pouco a cada vez (como Pix para uma pessoa)? Use “Criar regra” e escolha só a parte que sempre aparece.</p>`,
    [
      { texto: 'Só esta', valor: 'so', secundario: true },
      { texto: 'Criar regra…', valor: 'regra', secundario: true },
      { texto: parecidas ? 'Sim, todas' : 'Sim, as próximas também', valor: 'todas' },
    ],
  );
  if (!escolha) { select.value = t.categoria; return; }
  if (escolha === 'regra') {
    const criou = await abrirDialogoRegra(t.descricao, nova, t.direcao);
    if (!criou) select.value = t.categoria;
    return;
  }
  const r = await api('/api/categoria', { id: t.id, categoria: nova, aplicarParecidas: escolha === 'todas' });
  if (r.erro) { mostrarToast(r.erro); select.value = t.categoria; return; }
  receber(r.estado);
  mostrarToast(escolha === 'todas' ? `Feito! Foi para ${nova} e vou lembrar nas próximas.` : `Foi para ${nova}.`);
}

async function definirLimite(cat) {
  const atualLimite = estado.limites[cat] || '';
  const valor = await abrirDialogo(
    `${cats[cat]?.emoji || ''} Limite para ${cat}`,
    `<p>Quanto você quer gastar no máximo por mês com ${esc(cat)}? Deixe vazio para tirar o limite.</p>
     <input class="campo num" id="campo-limite" type="number" min="0" step="10" inputmode="decimal" placeholder="Ex.: 300" value="${atualLimite}">`,
    [
      { texto: 'Cancelar', valor: null, secundario: true },
      { texto: 'Salvar limite', valor: 'salvar' },
    ],
  );
  if (valor !== 'salvar') return;
  const v = $('#campo-limite').value;
  const r = await api('/api/limite', { categoria: cat, valor: v });
  if (r.erro) return mostrarToast(r.erro);
  receber(r.estado);
  mostrarToast(Number(v) > 0 ? `Limite de ${dinheiro(Number(v))} salvo para ${cat}.` : `Limite de ${cat} removido.`);
}

// ---------- Tooltip e toast ----------
function mostrarTooltip(e, texto) {
  const tip = $('#tooltip');
  tip.textContent = texto;
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - w / 2)) + 'px';
  tip.style.top = (e.clientY - 40) + 'px';
}
function esconderTooltip() { $('#tooltip').hidden = true; }

let timerToast;
function mostrarToast(texto) {
  const el = $('#toast');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- Eventos ----------
function mudarMes(delta) {
  atual = somarMes(atual.ano, atual.mes, delta);
  desenhar();
}
$('#btn-atualizar').addEventListener('click', () => atualizar(false));
$('#btn-sair').addEventListener('click', async () => {
  await fetch('/api/sair', { method: 'POST' });
  location.replace('/');
});
$('#mes-anterior').addEventListener('click', () => mudarMes(-1));
$('#mes-seguinte').addEventListener('click', () => mudarMes(1));
$('#categorias').addEventListener('click', (e) => {
  const b = e.target.closest('.cat');
  if (b) return abrirPainel({ tipo: 'categoria', cat: b.dataset.cat });
  if (e.target.closest('[data-painel="ignoradas"]')) abrirPainel({ tipo: 'ignoradas' });
});
$('#kpis').addEventListener('click', (e) => { if (e.target.closest('[data-painel="entradas"]')) abrirPainel({ tipo: 'entradas' }); });
$('#painel').addEventListener('change', (e) => { if (e.target.matches('select[data-id]')) mudarCategoria(e.target); });
$('#painel').addEventListener('click', (e) => {
  if (e.target.closest('#painel-fechar') || e.target === $('#painel')) $('#painel').close();
  if (e.target.closest('#painel-limite') && painel && painel.cat) definirLimite(painel.cat);
});
$('#painel').addEventListener('close', () => { painel = null; });
$('#investimentos').addEventListener('click', (e) => {
  if (e.target.closest('[data-painel-inv]')) abrirPainel({ tipo: 'categoria', cat: 'Investimentos' });
  if (e.target.closest('#ver-resgatados')) { mostrarResgatados = !mostrarResgatados; desenhar(); }
});
$('#regra-texto').addEventListener('input', atualizarPreviaRegra);
$('#regra-direcao').addEventListener('change', atualizarPreviaRegra);
$('#regra-categoria').addEventListener('change', atualizarPreviaRegra);
$('#regra-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = await criarRegra($('#regra-texto').value, $('#regra-categoria').value, $('#regra-direcao').value);
  if (ok) { $('#regra-texto').value = ''; atualizarPreviaRegra(); }
});
$('#regras').addEventListener('click', async (e) => {
  const id = e.target.dataset && e.target.dataset.remover;
  if (!id) return;
  const r = await api('/api/regras/remover', { id });
  if (r.erro) return mostrarToast(r.erro);
  receber(r.estado);
  mostrarToast('Regra removida.');
});
// Atualiza o "há X min" de vez em quando e busca novidades se o app ficar aberto por muito tempo.
setInterval(() => { desenharStatus(); }, 60000);
setInterval(() => { if (estado && !estado.demo) atualizar(true); }, 6 * 3600 * 1000);

carregar();

// CupyCoin: versão que roda no seu computador.
// Rode com:  node server.js   (ou dê dois cliques em iniciar.bat)
// A versão da internet (AWS) usa o mesmo "coração" (src/app.js), através do lambda.js.

const http = require('http');
const { exec } = require('child_process');

const { lerConfiguracao } = require('./src/banco');
const { armazenamentoLocal } = require('./src/armazenamento');
const { criarApp } = require('./src/app');

const configInicial = lerConfiguracao();
const porta = configInicial.porta;

const app = criarApp({
  armazenamento: armazenamentoLocal(),
  // Relê o arquivo a cada pedido: assim você pode preencher o configuracao.env sem reiniciar o app.
  obterConfig: async () => lerConfiguracao(),
  exigirLogin: false,
});

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (c) => {
      dados += c;
      if (dados.length > 1e6) { reject(new Error('Corpo grande demais')); req.destroy(); }
    });
    req.on('end', () => resolve(dados));
    req.on('error', reject);
  });
}

const servidor = http.createServer(async (req, res) => {
  try {
    // Proteção extra: no seu PC, só aceita pedidos vindos do próprio computador.
    const host = String(req.headers.host || '');
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) { res.writeHead(403); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    const resposta = await app.tratar({
      metodo: req.method,
      caminho: url.pathname,
      headers: req.headers,
      corpoTexto: req.method === 'POST' ? await lerCorpo(req) : '',
    });
    const headers = { ...resposta.headers };
    if (resposta.cookies) headers['Set-Cookie'] = resposta.cookies;
    res.writeHead(resposta.status, headers);
    res.end(resposta.corpo);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: 'Erro interno: ' + e.message }));
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`O app já está aberto em outra janela. Abrindo o navegador em http://localhost:${porta}`);
    abrirNavegador();
    setTimeout(() => process.exit(0), 500);
  } else {
    console.error(e);
    process.exit(1);
  }
});

function abrirNavegador() {
  if (process.env.NAO_ABRIR_NAVEGADOR) return;
  const endereco = `http://localhost:${porta}`;
  const comando = process.platform === 'win32' ? `start "" "${endereco}"` : process.platform === 'darwin' ? `open "${endereco}"` : `xdg-open "${endereco}"`;
  exec(comando);
}

servidor.listen(porta, '127.0.0.1', () => {
  console.log('');
  console.log('  🪙 CupyCoin está rodando!');
  console.log(`  Abra no navegador: http://localhost:${porta}`);
  console.log(configInicial.configurado
    ? `  Conectado a ${configInicial.itemIds.length} banco(s) pela Pluggy.`
    : '  (Modo demonstração: dados fictícios. Veja o README.md para conectar seus bancos.)');
  console.log('  Para fechar, feche esta janela.');
  console.log('');
  abrirNavegador();
});

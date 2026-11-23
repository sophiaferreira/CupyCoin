// Onde os dados ficam guardados.
// - No seu computador: arquivos JSON na pasta "dados" (src/banco.js).
// - Na AWS: um arquivo JSON num "bucket" do S3 (o "HD" da AWS), sem acesso público.

const { carregar, salvar, migrarCategorias, bancoVazio } = require('./banco');

function armazenamentoLocal() {
  return {
    async carregar(demo) { return carregar(demo); },
    async salvar(banco, demo) { salvar(banco, demo); },
  };
}

function armazenamentoS3(nomeDoBucket) {
  // O SDK da AWS já vem instalado dentro do Lambda; no seu PC ele não é usado.
  const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({});
  const chave = (demo) => (demo ? 'dados/demonstracao.json' : 'dados/meus-dados.json');

  return {
    async carregar(demo) {
      try {
        const resp = await s3.send(new GetObjectCommand({ Bucket: nomeDoBucket, Key: chave(demo) }));
        const texto = await resp.Body.transformToString('utf8');
        return migrarCategorias({ ...bancoVazio(), ...JSON.parse(texto) });
      } catch (e) {
        if (e.name === 'NoSuchKey' || (e.$metadata && e.$metadata.httpStatusCode === 404)) return null;
        throw e;
      }
    },
    async salvar(banco, demo) {
      await s3.send(new PutObjectCommand({
        Bucket: nomeDoBucket,
        Key: chave(demo),
        Body: JSON.stringify(banco),
        ContentType: 'application/json',
      }));
    },
  };
}

module.exports = { armazenamentoLocal, armazenamentoS3 };

// Cópias de segurança: o ficheiro tem as tabelas e os dados, ficam só as últimas 7 e a cópia restaura-se.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./ajuda');
const db = require('../src/db');
const { fazerCopia, listarCopias, restaurarCopia, caminhoCopia, PASTA_COPIAS, COPIAS_GUARDADAS } = require('../src/lib/copias');

test('a cópia tem a estrutura e os dados de todas as escolas', async () => {
  const nome = await fazerCopia();
  const texto = fs.readFileSync(path.join(PASTA_COPIAS, nome), 'utf8');
  assert.match(texto, /CREATE TABLE `tb_alunos`/);
  assert.match(texto, /INSERT INTO `tb_alunos` VALUES/);
  assert.match(texto, /INSERT INTO `escolas` VALUES/);
  assert.doesNotMatch(texto, /INSERT INTO `tb_sessoes`/, 'as sessões não vão na cópia');
});

test(`ficam só as últimas ${COPIAS_GUARDADAS} cópias`, async () => {
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(PASTA_COPIAS, `copia_2020-01-0${d}_0300.sql`), '-- antiga\n');
  await fazerCopia();
  const copias = listarCopias();
  assert.equal(copias.length, COPIAS_GUARDADAS);
  assert.ok(!copias.some((c) => c.nome === 'copia_2020-01-01_0300.sql'), 'a mais antiga foi apagada');
});

test('não se descarrega nada fora da pasta das cópias', () => {
  assert.equal(caminhoCopia('../package.json'), null);
  assert.equal(caminhoCopia('copia_2020-01-01_0300.sql/../../x'), null);
});

test('restaurar a cópia devolve os dados', async () => {
  const antes = (await db.plataforma.um('SELECT COUNT(*) AS n FROM tb_alunos')).n;
  const nome = await fazerCopia();
  await db.plataforma.executar('DELETE FROM tb_avisos_faltas');
  await db.plataforma.executar("UPDATE tb_alunos SET nome = 'Estragado' WHERE id = 1");
  await restaurarCopia(path.join(PASTA_COPIAS, nome));
  assert.equal((await db.plataforma.um('SELECT COUNT(*) AS n FROM tb_alunos')).n, antes);
  assert.notEqual((await db.plataforma.um('SELECT nome FROM tb_alunos WHERE id = 1')).nome, 'Estragado');
});

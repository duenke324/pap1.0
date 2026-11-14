// Instaladores de cada escola (descarregados no painel da plataforma, na página da escola):
//
// 1. Atalho de app (Windows, .cmd): cria no ambiente de trabalho e no menu Iniciar os ícones da escola,
//    que abrem a Gestão Escolar e a Conversas dessa escola em janela própria (Edge ou Chrome em modo
//    "app", como o PWA instalado). Não instala nenhum servidor: os endereços são os desta instalação.
//
// 2. Servidor completo (.zip): o Node, a aplicação e só os dados dessa escola, para instalar e correr
//    num PC da própria escola (com o XAMPP). Lá dentro: instalar.cmd (cria a base de dados e importa os
//    dados) e iniciar.cmd (arranca a Gestão Escolar e a Conversas).
const fs = require('node:fs');
const path = require('node:path');
const { pastaBase } = require('./recursos');
const { plataforma, TABELAS_ESCOLA, PASTA_FOTOS, PASTA_JUSTIFICATIVOS } = require('../db');
const { criarZip } = require('./zip');

// Nome que pode ir num nome de ficheiro do Windows
const nomeFicheiro = (texto) => String(texto).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Escola';
// Texto entre plicas numa linha de PowerShell ('...'): a plica escreve-se duas vezes
const plicas = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

// Ícone .ico feito a partir dos PNG (desde o Windows Vista, um .ico pode levar imagens PNG lá dentro)
function icoDePngs(ficheiros) {
  const imagens = ficheiros.map((f) => fs.readFileSync(f));
  const cabecalho = Buffer.alloc(6 + 16 * imagens.length);
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(imagens.length, 4);
  let posicao = cabecalho.length;
  imagens.forEach((png, i) => {
    const largura = png.readUInt32BE(16);
    const e = 6 + 16 * i;
    cabecalho.writeUInt8(largura >= 256 ? 0 : largura, e);
    cabecalho.writeUInt8(largura >= 256 ? 0 : largura, e + 1);
    cabecalho.writeUInt16LE(1, e + 4); // planos
    cabecalho.writeUInt16LE(32, e + 6); // bits por píxel
    cabecalho.writeUInt32LE(png.length, e + 8);
    cabecalho.writeUInt32LE(posicao, e + 12);
    posicao += png.length;
  });
  return Buffer.concat([cabecalho, ...imagens]);
}

const icones = (pasta) => icoDePngs(['icon-96.png', 'icon-192.png'].map((f) => path.join(pastaBase(), pasta, 'icons', f)));

// ---------- 1. Atalho de app ----------
// Um .cmd que se executa a si próprio em PowerShell (a parte depois de ##POWERSHELL##): assim é um só
// ficheiro, sem nada para descompactar. Tudo fica em %LOCALAPPDATA%\GestaoEscolar\<código>, com um
// "Desinstalar" no menu Iniciar.
function instaladorAtalho(escola, { urlGestao, urlConversas }) {
  const nome = nomeFicheiro(escola.nome);
  const ps = `
$ErrorActionPreference = 'Stop'
$nome = ${plicas(nome)}
$pasta = Join-Path $env:LOCALAPPDATA ${plicas(`GestaoEscolar\\${escola.codigo}`)}
$urlGestao = ${plicas(urlGestao)}
$urlConversas = ${plicas(urlConversas)}

Write-Host ''
Write-Host "  A instalar $nome..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
[IO.File]::WriteAllBytes((Join-Path $pasta 'gestao.ico'), [Convert]::FromBase64String('${icones('public').toString('base64')}'))
[IO.File]::WriteAllBytes((Join-Path $pasta 'conversas.ico'), [Convert]::FromBase64String('${icones(path.join('teams', 'publico')).toString('base64')}'))

# Abre em janela própria (modo "app") no Microsoft Edge, que vem com o Windows, ou no Google Chrome
$browser = @(
  "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
  "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Nao foi encontrado o Microsoft Edge nem o Google Chrome.' }

$shell = New-Object -ComObject WScript.Shell
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) $nome
$ambiente = [Environment]::GetFolderPath('Desktop')
New-Item -ItemType Directory -Force -Path $menu | Out-Null

function Novo-Atalho($ficheiro, $alvo, $argumentos, $icone, $descricao) {
  $a = $shell.CreateShortcut($ficheiro)
  $a.TargetPath = $alvo
  $a.Arguments = $argumentos
  $a.IconLocation = "$icone,0"
  $a.Description = $descricao
  $a.WorkingDirectory = $pasta
  $a.Save()
}
$atalhos = @(
  @{ nome = $nome; url = $urlGestao; icone = (Join-Path $pasta 'gestao.ico'); descricao = "Gestao Escolar - $nome" },
  @{ nome = "Conversas - $nome"; url = $urlConversas; icone = (Join-Path $pasta 'conversas.ico'); descricao = "Conversas - $nome" }
)
foreach ($at in $atalhos) {
  foreach ($onde in @($menu, $ambiente)) {
    Novo-Atalho (Join-Path $onde "$($at.nome).lnk") $browser "--app=$($at.url)" $at.icone $at.descricao
  }
}

# Desinstalar: apaga os atalhos e esta pasta
$desinstalar = @"
Remove-Item -LiteralPath (Join-Path '$ambiente' '$nome.lnk'), (Join-Path '$ambiente' 'Conversas - $nome.lnk') -ErrorAction SilentlyContinue
Remove-Item -LiteralPath '$menu' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath '$pasta' -Recurse -Force -ErrorAction SilentlyContinue
"@
Set-Content -LiteralPath (Join-Path $pasta 'desinstalar.ps1') -Value $desinstalar -Encoding UTF8
Novo-Atalho (Join-Path $menu "Desinstalar $nome.lnk") "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File \`"$(Join-Path $pasta 'desinstalar.ps1')\`"" (Join-Path $pasta 'gestao.ico') "Desinstalar $nome"

Write-Host ''
Write-Host "  Pronto! Ficaram no ambiente de trabalho e no menu Iniciar:" -ForegroundColor Green
Write-Host "    - $nome  ($urlGestao)"
Write-Host "    - Conversas - $nome  ($urlConversas)"
Write-Host ''
Start-Process $browser "--app=$urlGestao"
`;
  // A parte .cmd tem de ser só ASCII; o PowerShell lê o próprio ficheiro em UTF-8 (com acentos)
  const cmd = [
    '@echo off',
    'rem Instalador da escola gerado pelo painel da plataforma (Sistema de Gestao Escolar).',
    'rem Cria os atalhos da escola no ambiente de trabalho e no menu Iniciar.',
    `title Instalar ${nome.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = [IO.File]::ReadAllText('%~f0', [Text.Encoding]::UTF8); $i = $t.IndexOf('##POWER' + 'SHELL##'); Invoke-Expression $t.Substring($i)"`,
    'echo.',
    'pause',
    'exit /b',
    '##POWERSHELL##',
  ].join('\r\n');
  return {
    nome: `Instalar ${nome}.cmd`,
    dados: Buffer.from(cmd + ps.replace(/\r?\n/g, '\r\n'), 'utf8'),
  };
}

// ---------- 2. Servidor completo ----------
// Os dados da escola: todas as linhas dela em cada tabela tb_… (sem a coluna escola_id)
async function exportarDadosEscola(escola) {
  const tabelas = {};
  for (const t of TABELAS_ESCOLA) {
    const linhas = await plataforma.todos(`SELECT * FROM \`tb_${t}\` WHERE escola_id = ? ORDER BY 1`, escola.id);
    tabelas[t] = linhas.map(({ escola_id, ...resto }) => resto);
  }
  const { id, codigo, nome, dominio_email, direcao_nome } = escola;
  return { formato: 'gestao-escolar-escola', versao: 1, exportado_em: new Date().toISOString(), escola: { id, codigo, nome, dominio_email, direcao_nome }, tabelas };
}

// Ficheiros de uma pasta (recursivo), com o caminho relativo à pasta base
function listarFicheiros(raiz, relativo, excluir = () => false) {
  const completo = path.join(raiz, relativo);
  if (!fs.existsSync(completo)) return [];
  const resultado = [];
  for (const f of fs.readdirSync(completo, { withFileTypes: true })) {
    const r = path.join(relativo, f.name);
    if (excluir(r)) continue;
    if (f.isDirectory()) resultado.push(...listarFicheiros(raiz, r, excluir));
    else if (f.isFile()) resultado.push(r);
  }
  return resultado;
}

function textosDoPacote(escola) {
  const iniciar = [
    '@echo off',
    'rem Arranca a Gestao Escolar (porta 3000) e a Conversas (porta 3100) desta escola.',
    'cd /d "%~dp0"',
    'set "NODE=node\\node.exe"',
    'if not exist "%NODE%" set "NODE=node"',
    'if "%DB_PORT%"=="" set "DB_PORT=3306"',
    'start "Gestao Escolar" "%NODE%" src\\app.js',
    'timeout /t 4 /nobreak >nul',
    'start "Conversas" "%NODE%" teams\\app.js',
    'timeout /t 2 /nobreak >nul',
    `start "" http://localhost:3000/${escola.codigo}/login`,
  ].join('\r\n');
  const instalar = [
    '@echo off',
    'rem Cria a base de dados gestao_escolar no MySQL deste PC (XAMPP) e importa os dados da escola.',
    'cd /d "%~dp0"',
    'set "NODE=node\\node.exe"',
    'if not exist "%NODE%" set "NODE=node"',
    'if "%DB_PORT%"=="" set "DB_PORT=3306"',
    '"%NODE%" src\\importar-escola.js dados-escola.json',
    'if errorlevel 1 (echo. & echo A instalacao nao terminou. Veja a mensagem acima. & pause & exit /b 1)',
    'echo.',
    'echo Para abrir a aplicacao, use o iniciar.cmd (ou o atalho no ambiente de trabalho).',
    `powershell -NoProfile -Command "$s = New-Object -ComObject WScript.Shell; $a = $s.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Servidor ${escola.codigo}.lnk')); $a.TargetPath = '%~dp0iniciar.cmd'; $a.WorkingDirectory = '%~dp0'; $a.IconLocation = '%~dp0public\\favicon.ico,0'; $a.Save()"`,
    'pause',
  ].join('\r\n');
  const leiaMe = `SERVIDOR DA ESCOLA — ${escola.nome}
Gerado pelo painel da plataforma do Sistema de Gestão Escolar em ${new Date().toLocaleString('pt-PT')}.

Este pacote tem a aplicação completa e só os dados desta escola (alunos, turmas, faltas,
avaliação, mensagens, fotografias e justificativos), para a escola correr o seu próprio servidor.

O QUE É PRECISO
  - Windows 10 ou 11
  - XAMPP com o MySQL/MariaDB ligado (painel do XAMPP > MySQL > Start), na porta 3306
${process.platform === 'win32' ? '  - (o Node já vem incluído, na pasta node\\)' : '  - Node.js 22 ou mais recente (https://nodejs.org), porque este pacote não traz o Node para Windows'}

INSTALAR (uma vez)
  1. Descompacte esta pasta para um sítio fixo (ex.: C:\\GestaoEscolar).
  2. Ligue o MySQL no painel do XAMPP.
  3. Abra o instalar.cmd. Cria a base de dados "gestao_escolar" e importa os dados da escola.
     (Se já existir uma base de dados gestao_escolar com OUTRA escola, a instalação para sem mexer em nada.)

USAR
  - Abra o iniciar.cmd (ou o atalho "Servidor ${escola.codigo}" no ambiente de trabalho).
  - Gestão Escolar: http://localhost:3000/${escola.codigo}/login
  - Conversas:      http://localhost:3100/${escola.codigo}/login
  - Painel da plataforma: http://localhost:3000/plataforma (utilizador "plataforma",
    palavra-passe inicial "plataforma123", que tem de ser trocada no primeiro acesso).

As contas e palavras-passe são as mesmas que a escola já tinha.
Outra porta do MySQL: antes de abrir os .cmd, escreva por exemplo  set DB_PORT=3307
`;
  return { iniciar, instalar, leiaMe };
}

async function pacoteServidor(escola) {
  const raiz = pastaBase();
  const pastaZip = `${escola.codigo}-servidor`;
  const ficheiros = [];
  const juntar = (relativo, origem = path.join(raiz, relativo)) => ficheiros.push({ nome: `${pastaZip}/${relativo}`, dados: fs.readFileSync(origem) });

  // A aplicação (sem a pasta data/, que tem os dados de todas as escolas)
  const codigo = ['src', 'public', 'teams', 'database', 'node_modules'];
  for (const pasta of codigo) for (const r of listarFicheiros(raiz, pasta, (x) => /(^|[\\/])\.(git|cache)|[\\/]\.bin$/.test(x))) juntar(r);
  for (const f of ['package.json', 'package-lock.json']) if (fs.existsSync(path.join(raiz, f))) juntar(f);
  // O Node deste servidor, se for Windows (é o mesmo que está a correr esta aplicação)
  if (process.platform === 'win32') juntar('node/node.exe', process.execPath);

  // Os ficheiros desta escola (só os dela: estão na subpasta com o código da escola)
  for (const base of [PASTA_FOTOS, PASTA_JUSTIFICATIVOS]) {
    const relBase = path.relative(raiz, base);
    for (const r of listarFicheiros(base, escola.codigo)) juntar(path.join(relBase, r), path.join(base, r));
  }

  const { iniciar, instalar, leiaMe } = textosDoPacote(escola);
  ficheiros.push(
    { nome: `${pastaZip}/dados-escola.json`, dados: JSON.stringify(await exportarDadosEscola(escola)) },
    { nome: `${pastaZip}/public/favicon.ico`, dados: icones('public') },
    { nome: `${pastaZip}/iniciar.cmd`, dados: iniciar },
    { nome: `${pastaZip}/instalar.cmd`, dados: instalar },
    { nome: `${pastaZip}/LEIA-ME.txt`, dados: leiaMe.replace(/\r?\n/g, '\r\n') }
  );
  return { nome: `${pastaZip}.zip`, dados: await criarZip(ficheiros) };
}

module.exports = { instaladorAtalho, pacoteServidor, exportarDadosEscola };

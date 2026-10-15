// Localização dos recursos da aplicação (public/, database/, data/).
// Em desenvolvimento correm a partir do código-fonte (src/..); empacotados como executável
// único (ver scripts/build-mac.sh), ficam ao lado do binário, dentro de Contents/Resources.
const path = require('node:path');
const { isSea } = require('node:sea');

function pastaBase() {
  if (isSea()) return path.join(path.dirname(process.execPath), '..', 'Resources');
  return path.join(__dirname, '..', '..');
}

module.exports = { pastaBase };

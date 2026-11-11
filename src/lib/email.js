// Envio de email (usado na recuperação de palavra-passe).
// Precisa de um servidor SMTP, indicado por variáveis de ambiente — tal como as chaves do Stripe,
// nunca ficam escritas no código:
//   SMTP_HOST, SMTP_PORT (587 por omissão), SMTP_USER, SMTP_PASS
//   SMTP_FROM  remetente, ex.: "Gestão Escolar <secretaria@epmontijo.edu.pt>" (por omissão, SMTP_USER)
// Sem SMTP_HOST nada é enviado: o email é escrito na consola do servidor, para se poder
// desenvolver e demonstrar a aplicação sem conta de email.
let transporte = null;

// Endereço público da aplicação, para as ligações dentro dos emails. Vem de uma variável de
// ambiente (e não do cabeçalho Host do pedido, que quem faz o pedido pode falsificar).
const APP_URL = (process.env.APP_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, '');

function emailConfigurado() {
  return !!process.env.SMTP_HOST;
}

function obterTransporte() {
  if (!transporte) {
    const nodemailer = require('nodemailer');
    const porta = Number(process.env.SMTP_PORT) || 587;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465, // 465 = TLS direto; 587 = STARTTLS
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return transporte;
}

// Devolve true se o email foi entregue ao servidor SMTP. Nunca lança erro: quem chama não deve
// falhar (nem revelar ao utilizador) só porque o email não saiu.
async function enviarEmail({ para, assunto, texto }) {
  const destinatarios = [].concat(para).filter(Boolean);
  if (!destinatarios.length) return false;

  if (!emailConfigurado()) {
    console.log(
      `\n[Email não enviado — SMTP por configurar]\nPara: ${destinatarios.join(', ')}\nAssunto: ${assunto}\n\n${texto}\n`
    );
    return false;
  }
  try {
    await obterTransporte().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destinatarios.join(', '),
      subject: assunto,
      text: texto,
    });
    return true;
  } catch (erro) {
    console.error('Falha ao enviar email:', erro.message);
    return false;
  }
}

module.exports = { enviarEmail, emailConfigurado, APP_URL };

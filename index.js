const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  const qrcode = require("qrcode-terminal");

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startBot();
      } else {
        console.log("❌ Bot desconectado do WhatsApp.");
      }
    } else if (connection === "open") {
      console.log("✅ Conectado ao WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!text) return;

    const dados = JSON.parse(fs.readFileSync("dados.json", "utf-8"));

    if (text.startsWith("!ganho ")) {
      const valor = parseFloat(text.replace("!ganho ", ""));
      dados.ganhos += valor;
      fs.writeFileSync("dados.json", JSON.stringify(dados, null, 2));
      await sock.sendMessage(sender, { text: `💰 Ganho registrado: R$${valor.toFixed(2)}` });

    } else if (text.startsWith("!gasto ")) {
      const partes = text.replace("!gasto ", "").trim().split(" ");
      const valor = parseFloat(partes[0]);
      const nome = partes.slice(1).join(" ") || "Gasto sem nome";

      if (isNaN(valor)) {
        await sock.sendMessage(sender, { text: `❌ Valor inválido.` });
        return;
      }

      dados.gastos += valor;
      dados.historicoDeGastos.push({ valor, nome, data: new Date().toISOString() });

      fs.writeFileSync("dados.json", JSON.stringify(dados, null, 2));
      await sock.sendMessage(sender, { text: `🧾 Gasto registrado:\nValor: R$${valor.toFixed(2)}\nNome: ${nome}` });

    } else if (text.startsWith("!possiveisgastos ")) {
      const valor = parseFloat(text.replace("!possiveisgastos ", ""));
      dados.possiveisgastos += valor;
      fs.writeFileSync("dados.json", JSON.stringify(dados, null, 2));
      await sock.sendMessage(sender, { text: `📌 Possível gasto adicionado: R$${valor.toFixed(2)}` });

    } else if (text === "!saldo") {
      const saldo = dados.ganhos - dados.gastos - dados.possiveisgastos;
      await sock.sendMessage(sender, {
        text: `📊 *Resumo Financeiro:*\n\n💰 Ganhos: R$${dados.ganhos.toFixed(2)}\n🧾 Gastos: R$${dados.gastos.toFixed(2)}\n📌 Possíveis Gastos: R$${dados.possiveisgastos.toFixed(2)}\n\n💡 *Saldo estimado:* R$${saldo.toFixed(2)}`
      });
    }
  });
}

startBot();

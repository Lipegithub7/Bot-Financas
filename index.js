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

    // Array de dicas financeiras
    const dicas = [
      "💡 Dica: Tente guardar 10% de toda entrada de dinheiro.",
      "💡 Dica: Corte pequenos gastos diários, eles viram um rombo no fim do mês.",
      "💡 Dica: Crie uma reserva de emergência equivalente a 6 meses de despesas.",
      "💡 Dica: Antes de comprar, pergunte: eu realmente preciso disso?",
      "💡 Dica: Pequenos investimentos mensais valem mais que esperar sobrar dinheiro."
    ];

    // ====== COMANDOS ======
    if (text.startsWith("!ganho ")) {
      const valor = parseFloat(text.replace("!ganho ", ""));
      dados.ganhos += valor;
      fs.writeFileSync("dados.json", JSON.stringify(dados, null, 2));
      await sock.sendMessage(sender, { text: `💰 Ganho registrado: R$${valor.toFixed(2)}` });

      // 🎯 Gamificação
      if (dados.ganhos >= 1000) {
        await sock.sendMessage(sender, { text: "🏆 Conquista: Você já registrou mais de R$1000 em ganhos!" });
      }

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

      // 🎯 Conquista
      if (dados.gastos >= 500) {
        await sock.sendMessage(sender, { text: "⚠️ Atenção: seus gastos já somam mais de R$500!" });
      }

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

      // Dica aleatória
      const dica = dicas[Math.floor(Math.random() * dicas.length)];
      await sock.sendMessage(sender, { text: dica });

    } else if (text === "!resumo") {
      // 🎉 Resumo estilo Spotify Wrapped
      const topGastos = [...dados.historicoDeGastos]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 3);

      let resumo = "📊 *Seu resumo financeiro*\n\n";
      resumo += `💰 Ganhos totais: R$${dados.ganhos.toFixed(2)}\n`;
      resumo += `🧾 Gastos totais: R$${dados.gastos.toFixed(2)}\n`;
      resumo += `📌 Possíveis gastos: R$${dados.possiveisgastos.toFixed(2)}\n\n`;

      resumo += "🔥 Seus top 3 gastos:\n";
      topGastos.forEach((g, i) => {
        resumo += `${i + 1}. R$${g.valor.toFixed(2)} em ${g.nome}\n`;
      });

      await sock.sendMessage(sender, { text: resumo });

    } else if (text === "!resetar") {
      // ♻️ Resetar banco de dados
      const novoBanco = {
        ganhos: 0,
        gastos: 0,
        possiveisgastos: 0,
        historicoDeGastos: []
      };

      fs.writeFileSync("dados.json", JSON.stringify(novoBanco, null, 2));
      await sock.sendMessage(sender, { text: "♻️ Todos os dados foram *resetados*. Seu saldo, ganhos e gastos agora estão zerados!" });
    }
  });
}

startBot();

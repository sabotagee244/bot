require('dotenv').config(); // carrega as variáveis do .env

const {
  Client, GatewayIntentBits, Partials, Events,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const sqlite3 = require('sqlite3');
const fs = require('fs');

// Lê config.json
const rawConfig = fs.readFileSync('./config.json');
const config = JSON.parse(rawConfig);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const db = new sqlite3.Database('./pedidos.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
      userId TEXT,
      nome TEXT,
      discordId TEXT,
      recrutador TEXT,
      status TEXT
    )
  `);
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  const guildId = interaction.guild?.id;
  const serverConfig = Object.values(config.servidores).find(s => s.guildId === guildId);
  if (!serverConfig) return;

  // Envia a mensagem com botão
  if (interaction.isChatInputCommand() && interaction.commandName === 'enviar-form') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('solicitar_set')
        .setLabel('📋 Pedir Set')
        .setStyle(ButtonStyle.Primary)
    );

    const message = await interaction.channel.send({
      content: '**Clique no botão abaixo para solicitar seu cargo no servidor!**',
      components: [row]
    });

    await message.pin();
    return interaction.reply({ content: 'Mensagem enviada e fixada com sucesso!', ephemeral: true });
  }

  // Mostra modal
  if (interaction.isButton() && interaction.customId === 'solicitar_set') {
    const modal = new ModalBuilder().setCustomId('formulario_solicitacao').setTitle('Solicitação de Set');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('nome_jogo').setLabel('Nome no jogo').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('id_jogo').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('recrutador').setLabel('Quem recrutou').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  // Envia para canal de aprovação
  if (interaction.isModalSubmit() && interaction.customId === 'formulario_solicitacao') {
    const nome = interaction.fields.getTextInputValue('nome_jogo');
    const id = interaction.fields.getTextInputValue('id_jogo');
    const recrutador = interaction.fields.getTextInputValue('recrutador');

    db.run(
      `INSERT INTO pedidos (userId, nome, discordId, recrutador, status) VALUES (?, ?, ?, ?, 'pendente')`,
      [interaction.user.id, nome, id, recrutador]
    );

    const canal = await client.channels.fetch(serverConfig.canalAprovacaoId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aprovar_${interaction.user.id}`).setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`negar_${interaction.user.id}`).setLabel('❌ Negar').setStyle(ButtonStyle.Danger)
    );

    await canal.send({
      content: `Novo pedido de <@${interaction.user.id}>:\n**Nome:** ${nome}\n**ID:** ${id}\n**Recrutador:** ${recrutador}`,
      components: [row]
    });

    return interaction.reply({ content: 'Pedido enviado para aprovação!', ephemeral: true });
  }

  // Aprovar ou negar
  if (interaction.isButton()) {
    const [action, userId] = interaction.customId.split('_');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: 'Usuário não encontrado no servidor.', ephemeral: true });

    if (action === 'aprovar') {
      db.get(`SELECT nome, discordId FROM pedidos WHERE userId = ?`, [userId], async (err, row) => {
        if (!row) return interaction.reply({ content: 'Pedido não encontrado.', ephemeral: true });
        try {
          await member.roles.add(serverConfig.cargoSolicitadoId);
          await member.setNickname(`${row.nome} | ${row.discordId}`);
          db.run(`UPDATE pedidos SET status = 'aprovado' WHERE userId = ?`, [userId]);
          return interaction.reply({ content: `✅ Pedido aprovado. Cargo atribuído a <@${userId}>.` });
        } catch (e) {
          return interaction.reply({ content: '❌ Erro ao atribuir cargo ou mudar nickname.', ephemeral: true });
        }
      });
    }

    if (action === 'negar') {
      db.run(`UPDATE pedidos SET status = 'negado' WHERE userId = ?`, [userId]);
      return interaction.reply({ content: `❌ Pedido de <@${userId}> foi negado.` });
    }
  }
});

// Token do .env
client.login(process.env.TOKEN);

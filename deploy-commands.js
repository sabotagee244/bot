const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config.json');

const commands = [
  new SlashCommandBuilder()
    .setName('enviar-form')
    .setDescription('Envia a mensagem para solicitar set')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    for (const servidor of Object.values(config.servidores)) {
      console.log(`📥 Registrando comandos para ${servidor.guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, servidor.guildId),
        { body: commands }
      );
    }
    console.log('✅ Comandos registrados com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
})();

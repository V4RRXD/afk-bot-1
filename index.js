const express = require("express");
const http = require("http");
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
app.use(express.json());

// ============ DISCORD BOT SETUP ============
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Lo simpan di Railway Variables

// ============ KONFIGURASI BOT ============
const config = {
  host: 'Spectral-Nova.aternos.me',
  port: 23782,
  username: 'Nexy',
  password: 'Rio132029',
  version: false
};

// ============ STATE ============
let bot = null;
let isBotRunning = false;
let botState = { registered: false };
const stateFile = './bot_state.json';

if (fs.existsSync(stateFile)) {
  try {
    botState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch(e) {}
}

// ============ FUNGSI START BOT ============
function startMinecraftBot() {
  if (bot) {
    try { bot.end(); } catch(e) {}
  }
  
  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version
  });
  
  bot.loadPlugin(armorManager);
  bot.loadPlugin(pathfinder);
  
  let loginSent = false;
  
  bot.once('spawn', () => {
    console.log(`✅ Bot spawned at ${bot.entity.position}`);
    isBotRunning = true;
    
    setTimeout(() => {
      if (!loginSent) {
        bot.chat(`/login ${config.password}`);
        loginSent = true;
      }
    }, 2000);
    
    // Auto guard
    const guardPos = bot.entity.position.clone();
    setTimeout(() => {
      try {
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
        bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z));
      } catch(e) {}
    }, 5000);
  });
  
  bot.on('message', (message) => {
    const msg = message.toString().toLowerCase();
    if (msg.includes('register') && !botState.registered) {
      bot.chat(`/register ${config.password} ${config.password}`);
      botState.registered = true;
      fs.writeFileSync(stateFile, JSON.stringify(botState));
    }
    if (msg.includes('login') && !loginSent) {
      bot.chat(`/login ${config.password}`);
      loginSent = true;
    }
    if (msg.includes('logged in') || msg.includes('welcome')) {
      console.log('✅ Bot logged in!');
    }
  });
  
  bot.on('kicked', (reason) => {
    console.log(`❌ Kicked: ${reason}`);
    isBotRunning = false;
    setTimeout(() => startMinecraftBot(), 30000);
  });
  
  bot.on('error', (err) => console.log(`⚠️ Error: ${err.message}`));
  bot.on('end', () => {
    console.log('🔌 Connection ended');
    isBotRunning = false;
    setTimeout(() => startMinecraftBot(), 30000);
  });
}

// ============ DISCORD PANEL ============
async function createPanelEmbed() {
  const status = isBotRunning ? '🟢 **ONLINE**' : '🔴 **OFFLINE**';
  const color = isBotRunning ? 0x00ff00 : 0xff0000;
  
  return new EmbedBuilder()
    .setTitle('Spectre AFK Bot Control Panel')
    .setDescription('Manage your personal AFK bot using the buttons below.\n\n**Secure backend system**\n**Auto reconnect support**\n\nRole Required to Use Panel.')
    .setColor(color)
    .addFields(
      { name: '📊 System Status', value: status, inline: true },
      { name: '🤖 Username', value: config.username, inline: true },
      { name: '🕐 Last Check', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: false }
    )
    .setFooter({ text: 'Spectre Panel' });
}

function createButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('Start Bot').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('Stop Bot').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('restart').setLabel('Restart Bot').setStyle(ButtonStyle.Primary)
    );
}

// ============ DISCORD EVENTS ============
discordClient.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${discordClient.user.tag}`);
});

discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  await interaction.deferReply({ ephemeral: true });
  
  switch (interaction.customId) {
    case 'start':
      if (!isBotRunning) {
        startMinecraftBot();
        await interaction.editReply('Bot started!');
      } else {
        await interaction.editReply('Bot is already running!');
      }
      break;
    case 'stop':
      if (bot && isBotRunning) {
        bot.end();
        isBotRunning = false;
        await interaction.editReply('Bot stopped!');
      } else {
        await interaction.editReply('Bot is not running!');
      }
      break;
    case 'status':
      await interaction.editReply(`Bot status: ${isBotRunning ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
      break;
    case 'restart':
      if (bot) bot.end();
      setTimeout(() => startMinecraftBot(), 2000);
      await interaction.editReply('Restarting bot...');
      break;
  }
  
  // Update panel
  const embed = await createPanelEmbed();
  await interaction.message.edit({ embeds: [embed], components: [createButtons()] });
});

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content === '/panel') {
    const embed = await createPanelEmbed();
    await message.channel.send({ embeds: [embed], components: [createButtons()] });
  }
});

// ============ WEB SERVER ============
app.get('/', (req, res) => res.send('Spectre AFK Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('✅ Web server running'));

// ============ START BOT ============
console.log('🤖 Starting Spectre AFK Bot...');
startMinecraftBot();
discordClient.login(DISCORD_TOKEN);

const express = require("express");
const http = require("http");
const readline = require("readline");
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ============ KONFIGURASI ============
const config = {
  host: 'Spectral-Nova.aternos.me',
  port: 23782,
  username: 'Foxy',
  password: 'Rio133000',
  version: false
};

// ============ LIST CHAT RANDOM ============
const randomChats = [
  "ok", "lol", "gg", "nice", "bruh", "rip", "fr", "cap", "bet", "lmao",
  "oof", "yikes", "sheesh", "pog", "lol ok", "xd", "wow", "hmm", "ah", "heh",
  "lag", "mb", "afk", "brb", "gtg", "back", "lagging", "yo", "sup", "hi"
];

// ============ STATE ============
const stateFile = './bot_state.json';
let botState = { registered: false };
let botInstance = null;
let isLoggedIn = false;
let alreadyLoggedIn = false;
let moveInterval = null;
let chatInterval = null;
let lookInterval = null;
let reconnectDelay = 5000;
let maxDelay = 60000;
let lastKickTime = 0;
let isReconnecting = false;

if (fs.existsSync(stateFile)) {
  try {
    botState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    console.log(`📁 Loaded state: registered = ${botState.registered}`);
  } catch(e) {}
}

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(botState), 'utf8');
}

function getDelay() {
  const secondsSinceKick = Math.floor((Date.now() - lastKickTime) / 1000);
  if (secondsSinceKick < 60 && lastKickTime > 0) {
    const waitTime = (60 - secondsSinceKick + 5) * 1000;
    console.log(`⏳ Cooldown: tunggu ${Math.floor(waitTime/1000)} detik`);
    return Math.min(waitTime, maxDelay);
  }
  const delay = Math.min(reconnectDelay, maxDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, maxDelay);
  return delay;
}

function resetDelay() {
  reconnectDelay = 5000;
}

// ============ RANDOM MOVEMENT ============
function startRandomMovements(bot) {
  if (moveInterval) clearInterval(moveInterval);
  moveInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;
    const actions = ['walk', 'jump', 'sprint', 'stop'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    switch(action) {
      case 'walk':
        const goal = new goals.GoalNear(
          bot.entity.position.x + (Math.random() - 0.5) * 8,
          bot.entity.position.y,
          bot.entity.position.z + (Math.random() - 0.5) * 8, 2);
        bot.pathfinder.setGoal(goal);
        break;
      case 'jump':
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 300);
        break;
      case 'sprint':
        bot.setControlState('sprint', true);
        setTimeout(() => {
          bot.setControlState('sprint', false);
          bot.setControlState('forward', false);
        }, 1500);
        break;
      case 'stop':
        bot.pathfinder.setGoal(null);
        bot.setControlState('forward', false);
        bot.setControlState('back', false);
        break;
    }
  }, 5000 + Math.random() * 8000);
}

function startRandomLooking(bot) {
  if (lookInterval) clearInterval(lookInterval);
  lookInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;
    const randomYaw = Math.random() * Math.PI * 2;
    const randomPitch = (Math.random() - 0.5) * Math.PI / 3;
    bot.look(randomYaw, randomPitch);
  }, 8000 + Math.random() * 12000);
}

function startRandomChat(bot) {
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;
    const msg = randomChats[Math.floor(Math.random() * randomChats.length)];
    bot.chat(msg);
  }, 45000 + Math.random() * 45000);
}

function stopRandomActivities() {
  if (moveInterval) clearInterval(moveInterval);
  if (chatInterval) clearInterval(chatInterval);
  if (lookInterval) clearInterval(lookInterval);
}

// ============ AUTO DETECT LOGIN (FORCED - NO FLAGS) ============
function autoDetectAndLogin(bot, messageText) {
  const msg = messageText.toLowerCase();
  
  // DETEK LOGIN - LANGSUNG KIRIM, ABAIKAN FLAG APAPUN
  if (msg.includes('please log in') || 
      msg.includes('please login') ||
      (msg.includes('/login') && msg.includes('password'))) {
    
    console.log('🔍 [AUTO-DETECT] Login prompt detected!');
    console.log(`🔑 Auto sending /login ${config.password}`);
    bot.chat(`/login ${config.password}`);
    return true;
  }

  // DETEK REGISTER
  if (msg.includes('register') && !botState.registered) {
    console.log('🔍 [AUTO-DETECT] Register prompt detected!');
    console.log(`🔐 Auto sending /register ${config.password} ${config.password}`);
    bot.chat(`/register ${config.password} ${config.password}`);
    botState.registered = true;
    saveState();
    return true;
  }

  return false;
}

// ============ MAIN BOT ============
function createBot() {
  if (isReconnecting) return;
  isReconnecting = true;

  console.log(`🔄 Connecting in ${Math.floor(getDelay()/1000)}s...`);

  setTimeout(() => {
    const bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version
    });

    bot.loadPlugin(armorManager);
    bot.loadPlugin(pathfinder);

    isLoggedIn = false;
    botInstance = bot;

    bot.on('message', (message) => {
      try {
        const msgText = message.toString();
        const msg = msgText.toLowerCase();

        console.log(`📨 [SERVER] ${msgText}`);

        // AUTO DETECT (PASTI JALAN)
        autoDetectAndLogin(bot, msgText);

        // SUKSES LOGIN
        if (msg.includes('logged in') || msg.includes('welcome') || msg.includes('successfully')) {
          if (!isLoggedIn) {
            console.log('✅ LOGIN SUCCESS! Bot is ready.');
            isLoggedIn = true;
            alreadyLoggedIn = true;
            resetDelay();
            isReconnecting = false;

            setTimeout(() => {
              startRandomMovements(bot);
              startRandomLooking(bot);
              startRandomChat(bot);
              bot.chat('yo');
            }, 3000);
          }
          return;
        }

        // BALAS MENTION
        if (alreadyLoggedIn && msg.includes(bot.username.toLowerCase())) {
          const replies = ["yo", "what", "yes", "no", "lol", "ok", "gg", "nice", "bruh"];
          const reply = replies[Math.floor(Math.random() * replies.length)];
          setTimeout(() => bot.chat(reply), 1000);
        }

      } catch(e) {}
    });

    bot.on('kicked', (reason) => {
      console.log(`❌ Kicked: ${JSON.stringify(reason)}`);
      lastKickTime = Date.now();
      isReconnecting = false;
      isLoggedIn = false;
      alreadyLoggedIn = false;
      stopRandomActivities();
      reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
      setTimeout(() => createBot(), getDelay());
    });

    bot.on('error', (err) => console.log(`⚠️ Error: ${err.message}`));
    
    bot.on('end', () => {
      console.log('🔌 Connection ended');
      isReconnecting = false;
      isLoggedIn = false;
      alreadyLoggedIn = false;
      stopRandomActivities();
      setTimeout(() => createBot(), getDelay());
    });

    bot.once('spawn', () => {
      console.log(`✅ Bot spawned at ${bot.entity.position}`);
      // Backup: kirim login pas spawn juga
      if (!alreadyLoggedIn) {
        console.log('🔑 Backup login on spawn...');
        bot.chat(`/login ${config.password}`);
      }
    });

    // CHAT COMMANDS
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const msg = message.toLowerCase();
      if (msg === 'pos') {
        bot.chat(`X:${Math.floor(bot.entity.position.x)} Y:${Math.floor(bot.entity.position.y)} Z:${Math.floor(bot.entity.position.z)}`);
      } else if (msg === 'stopmove') {
        bot.pathfinder.setGoal(null);
        bot.setControlState('forward', false);
        bot.chat('Stopped moving!');
      }
    });

  }, getDelay());
}

// ============ DISCORD PANEL ==========
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

async function checkStatus() {
  try {
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}`, { timeout: 5000 });
    if (response.ok) return { status: 'Online', color: 0x00ff00 };
  } catch (error) {
    return { status: 'Offline', color: 0xff0000 };
  }
  return { status: 'Unknown', color: 0xffff00 };
}

async function createPanelEmbed() {
  const status = await checkStatus();
  return new EmbedBuilder()
    .setTitle('Spectre AFK Bot Control Panel')
    .setDescription('Manage your personal AFK bot using the buttons below.\n\nSecure backend system\nAuto reconnect support')
    .setColor(status.color)
    .addFields({ name: 'System Status', value: status.status, inline: true })
    .setFooter({ text: 'Spectre System' })
    .setTimestamp();
}

function createButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('Start Bot').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('Stop Bot').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('restart').setLabel('Restart Bot').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary)
    );
}

discordClient.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${discordClient.user.tag}`);
});

discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  await interaction.deferReply({ ephemeral: true });

  switch (interaction.customId) {
    case 'start':
      if (!isLoggedIn) {
        createBot();
        await interaction.editReply('✅ Bot started!');
      } else {
        await interaction.editReply('⚠️ Bot is already running!');
      }
      break;
    case 'stop':
      if (botInstance) {
        botInstance.end();
        isLoggedIn = false;
        alreadyLoggedIn = false;
        await interaction.editReply('✅ Bot stopped!');
      } else {
        await interaction.editReply('⚠️ Bot is not running!');
      }
      break;
    case 'restart':
      if (botInstance) botInstance.end();
      isLoggedIn = false;
      alreadyLoggedIn = false;
      setTimeout(() => createBot(), 2000);
      await interaction.editReply('🔄 Restarting bot...');
      break;
    case 'status':
      const status = await checkStatus();
      await interaction.editReply(`System Status: ${status.status}`);
      break;
  }

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

// ============ WEB SERVER ==========
app.get('/', (req, res) => res.send('Spectre AFK Bot is running!'));
app.post('/stop', (req, res) => {
  console.log('🛑 Stop command received');
  res.json({ success: true });
  if (botInstance) botInstance.end();
  isLoggedIn = false;
  alreadyLoggedIn = false;
});

app.listen(process.env.PORT || 3000, () => console.log('✅ Web server running'));

// ============ START ==========
console.log('🤖 Starting Spectre AFK Bot...');
createBot();
discordClient.login(DISCORD_TOKEN);

const express = require("express");
const http = require("http");
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
app.use(express.json());

// ============ KONFIGURASI ============
const config = {
  host: 'Spectral-Nova.aternos.me',
  port: 23782,
  username: 'Nexy',
  password: 'Rio132029',
  version: false
};

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const RAILWAY_URL = 'https://afk-bot-1-production.up.railway.app';

// ============ LIST CHAT RANDOM ============
const randomChats = [
  "ok", "lol", "gg", "nice", "bruh", "rip", "fr", "cap", "bet", "lmao",
  "oof", "yikes", "sheesh", "pog", "lol ok", "xd", "wow", "hmm", "ah", "heh",
  "lag", "mb", "afk", "brb", "gtg", "back", "lagging"
];

// ============ STATE ============
let bot = null;
let isBotRunning = false;
let isLoggedIn = false;
let loginSent = false;
let alreadyLoggedIn = false;
let registerSent = false;
let botState = { registered: false };
const stateFile = './bot_state.json';

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
  console.log('✅ Delay reset');
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
  }, 8000 + Math.random() * 12000);
}

function startRandomLooking(bot) {
  if (lookInterval) clearInterval(lookInterval);
  
  lookInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;
    const randomYaw = Math.random() * Math.PI * 2;
    const randomPitch = (Math.random() - 0.5) * Math.PI / 3;
    bot.look(randomYaw, randomPitch);
  }, 10000 + Math.random() * 15000);
}

function startRandomChat(bot) {
  if (chatInterval) clearInterval(chatInterval);
  
  chatInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;
    const msg = randomChats[Math.floor(Math.random() * randomChats.length)];
    bot.chat(msg);
    console.log(`💬 Said: ${msg}`);
  }, 45000 + Math.random() * 45000);
}

function stopRandomActivities() {
  if (moveInterval) clearInterval(moveInterval);
  if (chatInterval) clearInterval(chatInterval);
  if (lookInterval) clearInterval(lookInterval);
}

// ============ MINECRAFT BOT ============
function startMinecraftBot() {
  if (isReconnecting) return;
  isReconnecting = true;
  
  console.log(`🔄 Connecting in ${Math.floor(getDelay()/1000)}s...`);
  
  setTimeout(() => {
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

    let guardPos = null;
    loginSent = false;
    isLoggedIn = false;
    
    bot.once('spawn', () => {
      console.log(`✅ Bot spawned at ${bot.entity.position}`);
      isBotRunning = true;
      guardPos = bot.entity.position.clone();
      
      if (!loginSent && !alreadyLoggedIn) {
        console.log('🔑 Sending login...');
        bot.chat(`/login ${config.password}`);
        loginSent = true;
      }
      
      setTimeout(() => {
        try {
          const mcData = require('minecraft-data')(bot.version);
          bot.pathfinder.setMovements(new Movements(bot, mcData));
          bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z));
          console.log(`🛡️ Auto-guarding spawn area`);
        } catch(e) {}
      }, 5000);
    });
    
    bot.on('message', (message) => {
      try {
        const msg = message.toString().toLowerCase();
        
        if (msg.includes('logged in') || msg.includes('welcome')) {
          if (!alreadyLoggedIn) {
            console.log('✅ LOGIN SUCCESS! Bot is ready.');
            alreadyLoggedIn = true;
            isLoggedIn = true;
            loginSent = true;
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
        
        if (msg.includes('register') && !botState.registered && !registerSent) {
          console.log('🔐 FIRST TIME - Registering...');
          registerSent = true;
          bot.chat(`/register ${config.password} ${config.password}`);
          botState.registered = true;
          saveState();
          setTimeout(() => {
            if (!alreadyLoggedIn) {
              bot.chat(`/login ${config.password}`);
              loginSent = true;
            }
          }, 3000);
          return;
        }
        
        if (alreadyLoggedIn) return;
        
        if (!loginSent && (msg.includes('login') || msg.includes('/login'))) {
          console.log('🔑 Auto login...');
          bot.chat(`/login ${config.password}`);
          loginSent = true;
        }
        
        if (msg.includes(bot.username.toLowerCase()) && alreadyLoggedIn) {
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
      loginSent = false;
      isBotRunning = false;
      stopRandomActivities();
      reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
      setTimeout(() => startMinecraftBot(), getDelay());
    });
    
    bot.on('error', (err) => console.log(`⚠️ Error: ${err.message}`));
    bot.on('end', () => {
      console.log('🔌 Connection ended');
      isReconnecting = false;
      isLoggedIn = false;
      isBotRunning = false;
      stopRandomActivities();
      setTimeout(() => startMinecraftBot(), getDelay());
    });
    
  }, getDelay());
}

// ============ DISCORD PANEL ============
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

async function checkStatus() {
  try {
    const response = await fetch(`${RAILWAY_URL}`, { timeout: 5000 });
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
      if (!isBotRunning) {
        startMinecraftBot();
        await interaction.editReply('✅ Bot started!');
      } else {
        await interaction.editReply('⚠️ Bot is already running!');
      }
      break;
    case 'stop':
      if (bot && isBotRunning) {
        bot.end();
        isBotRunning = false;
        await interaction.editReply('✅ Bot stopped!');
      } else {
        await interaction.editReply('⚠️ Bot is not running!');
      }
      break;
    case 'restart':
      if (bot) bot.end();
      setTimeout(() => startMinecraftBot(), 2000);
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

// ============ WEB SERVER ============
app.get('/', (req, res) => res.send('Spectre AFK Bot is running!'));
app.post('/stop', (req, res) => {
  console.log('🛑 Stop command received from Discord!');
  res.json({ success: true });
  if (bot) bot.end();
  isBotRunning = false;
});

app.listen(process.env.PORT || 3000, () => console.log('✅ Web server running'));

// ============ START ============
console.log('🤖 Starting Spectre AFK Bot...');
console.log(`📁 Registered: ${botState.registered ? 'YES' : 'NO'}`);
startMinecraftBot();
discordClient.login(DISCORD_TOKEN);

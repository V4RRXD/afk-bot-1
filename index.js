const express = require("express");
const http = require("http");
const readline = require("readline");
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const fs = require('fs');
const app = express();

app.use(express.json());
app.get("/", (_, res) => res.sendFile(__dirname + "/index.html"));
app.listen(process.env.PORT || 3000);

// ============ SETUP CONSOLE INPUT ============
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ============ KONFIGURASI ============
const config = {
  host: 'Spectral-Nova.aternos.me',
  port: 23782,
  username: 'Floxy',
  password: 'Rio132025',
  version: false
};

// ============ LIST CHAT RANDOM ============
const randomChats = [
  "ok", "lol", "gg", "nice", "bruh", "rip", "fr", "cap", "bet", "lmao",
  "oof", "yikes", "sheesh", "pog", "lol ok", "xd", "wow", "hmm", "ah", "heh",
  "ok..", "lol..", "nice..", "gg..", "bruh..", "rip..", "period.", ".",
  "lag", "mb", "afk", "brb", "gtg", "back", "lagging", "mb guys", "g2g",
  "yo", "sup", "hi", "hello", "wyd", "nm", "same", "frfr", "no cap"
];

// ============ STATE MANAGEMENT ============
const stateFile = './bot_state.json';
let botState = { registered: false };
let botInstance = null;
let isLoggedIn = false;

// Random movement timers
let moveInterval = null;
let chatInterval = null;
let lookInterval = null;

if (fs.existsSync(stateFile)) {
  try {
    botState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    console.log(`📁 Loaded state: registered = ${botState.registered}`);
  } catch(e) {}
}

let reconnectDelay = 5000;
let maxDelay = 60000;
let lastKickTime = 0;
let isReconnecting = false;

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

// ============ RANDOM MOVEMENT (TANPA PVP) ============
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
          bot.entity.position.z + (Math.random() - 0.5) * 8,
          2
        );
        bot.pathfinder.setGoal(goal);
        console.log(`🚶 Walking to random spot`);
        break;

      case 'jump':
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 300);
        console.log(`🦘 Jumping`);
        break;

      case 'sprint':
        bot.setControlState('sprint', true);
        setTimeout(() => {
          bot.setControlState('sprint', false);
          bot.setControlState('forward', false);
        }, 1500);
        console.log(`💨 Sprinting`);
        break;

      case 'stop':
        bot.pathfinder.setGoal(null);
        bot.setControlState('forward', false);
        bot.setControlState('back', false);
        console.log(`🛑 Stopped moving`);
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
    console.log(`👀 Looking around`);
  }, 8000 + Math.random() * 12000);
}

function startRandomChat(bot) {
  if (chatInterval) clearInterval(chatInterval);

  chatInterval = setInterval(() => {
    if (!bot || !bot.entity || !isLoggedIn) return;

    const msg = randomChats[Math.floor(Math.random() * randomChats.length)];
    bot.chat(msg);
    console.log(`💬 Said: ${msg}`);
  }, 45000 + Math.random() * 45000); // Chat tiap 45-90 detik
}

function stopRandomActivities() {
  if (moveInterval) clearInterval(moveInterval);
  if (chatInterval) clearInterval(chatInterval);
  if (lookInterval) clearInterval(lookInterval);
  moveInterval = null;
  chatInterval = null;
  lookInterval = null;
}

// ============ FUNGSI KIRIM CHAT DARI CONSOLE ============
function sendChat(message) {
  if (botInstance && botInstance.entity && isLoggedIn) {
    botInstance.chat(message);
    console.log(`💬 [BOT] ${message}`);
  } else {
    console.log('❌ Bot belum siap / belum login!');
  }
}

// ============ HANDLE CONSOLE INPUT ============
function handleConsoleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('/')) {
    if (botInstance && botInstance.entity) {
      botInstance.chat(trimmed);
      console.log(`📡 [COMMAND] ${trimmed}`);
    } else {
      console.log('❌ Bot belum siap!');
    }
  } else {
    sendChat(trimmed);
  }
}

rl.on('line', (input) => {
  handleConsoleInput(input);
});

console.log('\n🎮 ========== CONSOLE COMMANDER ACTIVE ==========');
console.log('💬 Ketik apapun untuk chat pake bot');
console.log('🔑 Ketik /login password untuk login manual');
console.log('=============================================\n');

// ============ AUTO DETECT LOGIN PROMPT ============
function autoDetectAndLogin(bot, messageText) {
  const msg = messageText.toLowerCase();

  if (msg.includes('please log in') || 
      msg.includes('please login') ||
      (msg.includes('/login') && msg.includes('password'))) {

    console.log('🔍 [AUTO-DETECT] Login prompt detected!');
    console.log(`🔑 Auto sending /login ${config.password}`);
    bot.chat(`/login ${config.password}`);
    return true;
  }

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

// ============ MAIN BOT (TANPA PVP) ============
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

    // HANYA LOAD PLUGIN YANG DIPERLUKAN (TANPA PVP)
    // bot.loadPlugin(pvp);  ← DIHAPUS / DIKOMEN
    bot.loadPlugin(armorManager);
    bot.loadPlugin(pathfinder);

    let registered = botState.registered;
    let loginAttempts = 0;
    let loginSent = false;
    isLoggedIn = false;
    botInstance = bot;

    // ============ AUTO DETECT & HANDLE MESSAGES ============
    bot.on('message', (message) => {
      try {
        const msgText = message.toString();
        const msg = msgText.toLowerCase();

        console.log(`📨 [SERVER] ${msgText}`);

        autoDetectAndLogin(bot, msgText);

        if (msg.includes('logged in') || msg.includes('welcome') || msg.includes('successfully')) {
          if (!isLoggedIn) {
            console.log('✅ LOGIN SUCCESS! Bot is ready.');
            isLoggedIn = true;
            resetDelay();
            isReconnecting = false;

            setTimeout(() => {
              startRandomMovements(bot);
              startRandomLooking(bot);
              startRandomChat(bot);
              bot.chat('yo');
              console.log('🎮 Bot started random movements & chat!');
            }, 3000);
          }
        }

        else if (msg.includes('wrong password') || msg.includes('incorrect password')) {
          loginAttempts++;
          console.log(`⚠️ Wrong password, attempt ${loginAttempts}/3`);
          if (loginAttempts <= 3) {
            setTimeout(() => bot.chat(`/login ${config.password}`), 3000);
          }
        }

        else if (msg.includes('already logged in')) {
          console.log('✅ Already logged in');
          isLoggedIn = true;
          resetDelay();
          isReconnecting = false;
          startRandomMovements(bot);
          startRandomLooking(bot);
          startRandomChat(bot);
        }

        // Balas mention
        if (msg.includes(bot.username.toLowerCase())) {
          const replies = ["yo", "what", "yes", "no", "lol", "ok", "gg", "nice", "bruh", "fr?", "hmm", "?"];
          const reply = replies[Math.floor(Math.random() * replies.length)];
          setTimeout(() => bot.chat(reply), 1000);
        }

      } catch(e) {}
    });

    // ============ HANDLE KICK & RECONNECT ============
    bot.on('kicked', (reason) => {
      const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
      console.log(`❌ Kicked: ${reasonText}`);
      lastKickTime = Date.now();
      isReconnecting = false;
      isLoggedIn = false;
      loginSent = false;
      stopRandomActivities();

      reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
      setTimeout(() => createBot(), getDelay());
    });

    bot.on('error', (err) => {
      console.log(`⚠️ Error: ${err.message}`);
    });

    bot.on('end', () => {
      console.log('🔌 Connection ended.');
      isReconnecting = false;
      isLoggedIn = false;
      loginSent = false;
      stopRandomActivities();
      setTimeout(() => createBot(), getDelay());
    });

    bot.once('spawn', () => {
      console.log(`✅ Bot spawned at ${bot.entity.position}`);
    });

    // ============ CHAT COMMANDS (TANPA PVP) ============
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const msg = message.toLowerCase();

      if (msg === 'come') {
        const player = bot.players[username];
        if (player && player.entity) {
          bot.chat(`Coming, ${username}!`);
          try {
            const mcData = require('minecraft-data')(bot.version);
            bot.pathfinder.setMovements(new Movements(bot, mcData));
            bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2));
          } catch(e) {}
        }
      } else if (msg === 'pos') {
        bot.chat(`X:${Math.floor(bot.entity.position.x)} Y:${Math.floor(bot.entity.position.y)} Z:${Math.floor(bot.entity.position.z)}`);
      } else if (msg === 'stopmove') {
        bot.pathfinder.setGoal(null);
        bot.setControlState('forward', false);
        bot.chat('Stopped moving!');
      }
    });

  }, getDelay());
}

console.log('🤖 Starting AFK Bot (No PVP / No Breaking Blocks)...');
console.log(`📁 Registered: ${botState.registered ? 'YES' : 'NO'}`);
createBot();

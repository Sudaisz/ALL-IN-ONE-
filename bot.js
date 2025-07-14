import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const USERS_FILE = './users.json';
const REQUIRED_CHANNELS = ['@channel1', '@channel2', '@channel3', '@channel4'];

const loadUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));

function ensureUser(userId) {
  const users = loadUsers();
  if (!users[userId]) {
    users[userId] = { username: null, password: null, stars: 0, referrals: [], premiumUntil: null };
    saveUsers(users);
  }
}

function isPremium(userId) {
  const users = loadUsers();
  const premium = users[userId]?.premiumUntil;
  return premium && new Date(premium) > new Date();
}

function activatePremium(userId) {
  const users = loadUsers();
  const until = new Date();
  until.setDate(until.getDate() + 30);
  users[userId].premiumUntil = until.toISOString();
  saveUsers(users);
}

function deductStars(userId, amount) {
  const users = loadUsers();
  if (users[userId].stars >= amount) {
    users[userId].stars -= amount;
    saveUsers(users);
    return true;
  }
  return false;
}

bot.start(async (ctx) => {
  ensureUser(ctx.from.id);
  await ctx.replyWithPhoto({ source: 'anime.jpg' }, {
    caption: `👋 Welcome! Use /register to begin. Use /play to play games.`
  });
});

bot.command('register', async (ctx) => {
  ensureUser(ctx.from.id);
  const users = loadUsers();
  const id = ctx.from.id;
  if (users[id].username) return ctx.reply('✅ Already registered.');

  ctx.reply('Send your username:');
  bot.once('text', async (msg) => {
    users[id].username = msg.message.text;
    saveUsers(users);
    ctx.reply('Send your password:');
    bot.once('text', (msg2) => {
      users[id].password = msg2.message.text;
      saveUsers(users);
      ctx.reply('✅ Registration complete.');
    });
  });
});

bot.command('buy_premium', async (ctx) => {
  const id = ctx.from.id.toString();
  ensureUser(id);
  if (id == ADMIN_ID.toString()) {
    activatePremium(id);
    return ctx.reply('👑 Premium activated for Admin.');
  }
  const users = loadUsers();
  if (users[id].stars >= 1) {
    return ctx.reply('Tap below to pay 1⭐ for 30 days premium:',
      Markup.inlineKeyboard([
        Markup.button.callback('Pay 1⭐', `pay:premium:1`)
      ]));
  } else {
    ctx.reply('❌ Not enough stars.');
  }
});

bot.command('get_report', (ctx) => {
  const id = ctx.from.id.toString();
  ensureUser(id);
  const users = loadUsers();
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) return ctx.reply('Usage: /get_report <type>');

  if (id == ADMIN_ID.toString()) {
    return ctx.reply(`📄 Report for ${args} (Admin bypass)`);
  }

  if (users[id].stars >= 3) {
    return ctx.reply('Tap to pay 3⭐ for report:',
      Markup.inlineKeyboard([
        Markup.button.callback('Pay 3⭐', `pay:report:3`)
      ]));
  } else if (users[id].referrals.length >= 5) {
    users[id].referrals = [];
    saveUsers(users);
    return ctx.reply(`📄 Report for ${args} generated using referrals.`);
  } else {
    ctx.reply('❌ Need 3⭐ or 5 referrals.');
  }
});

bot.command('play', (ctx) => {
  ctx.reply('🎮 Choose a game:', Markup.inlineKeyboard([
    [Markup.button.callback('X and O', 'game:xo')],
    [Markup.button.callback('Snake', 'game:snake')],
    [Markup.button.callback('Rock Paper Scissors', 'game:rps')],
    [Markup.button.callback('2048', 'game:2048')],
    [Markup.button.callback('/random staking game', 'game:random')],
  ]));
});

bot.action(/game:(.+)/, async (ctx) => {
  const game = ctx.match[1];
  if (game === 'random') {
    return ctx.reply('🔁 Send /random to start a staking match!');
  } else {
    return ctx.reply(`🎲 The game '${game}' is under construction.`);
  }
});

bot.command('random', async (ctx) => {
  ctx.reply('⚠️ You are about to stake your stars in a random match. Type "cancel" within 4 seconds to stop.');
  const userId = ctx.from.id;
  let cancelled = false;

  bot.once('text', (msg) => {
    if (msg.message.text.toLowerCase() === 'cancel') {
      cancelled = true;
      ctx.reply('❌ Game cancelled.');
    }
  });

  setTimeout(() => {
    if (!cancelled) {
      const opponentId = Math.floor(Math.random() * 2) === 0 ? userId : 'opponent';
      if (opponentId === userId) {
        ctx.reply('🎉 You won and claimed all the stars!');
      } else {
        ctx.reply('😢 You lost this time. Better luck next round.');
      }
    }
  }, 4000);
});

bot.on('callback_query', async (ctx) => {
  const [action, purpose, amount] = ctx.callbackQuery.data.split(':');
  const id = ctx.from.id.toString();

  if (action === 'pay' && deductStars(id, parseInt(amount))) {
    if (purpose === 'premium') {
      activatePremium(id);
      return ctx.editMessageText('🎉 Premium activated!');
    } else if (purpose === 'report') {
      return ctx.editMessageText('📄 Report generated successfully!');
    }
  } else {
    ctx.editMessageText('❌ Not enough stars.');
  }
  ctx.answerCbQuery();
});

bot.launch();
console.log("🤖 Bot is running...");

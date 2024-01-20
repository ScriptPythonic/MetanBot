const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const botToken =  '6896588206:AAE1PFmll6Lc9UTgnL0KIo7OcSeDlNxHAno';
const bot = new TelegramBot(botToken, { polling: true });
const db = new sqlite3.Database('users.db');

// Create a users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    chat_id INTEGER UNIQUE,
    username TEXT,
    balance INTEGER DEFAULT 100,
    referral_code TEXT UNIQUE
  )
`);

// Create a referrals table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS referrals (
    referral_id INTEGER PRIMARY KEY,
    referring_user INTEGER,
    referred_user INTEGER,
    FOREIGN KEY(referring_user) REFERENCES users(user_id),
    FOREIGN KEY(referred_user) REFERENCES users(user_id)
  )
`);

const welcomeMessage = `Congratulations! 🎉\n\nYou’ve joined the Moonshot Capital Squad!\n\nNow it's time to get to the top! 🏆\n\nPress the "Play" button below to start.`;

// Function to notify referrer when someone registers using their link
function notifyReferrer(referringUserId, referredUsername) {
    db.get('SELECT chat_id FROM users WHERE user_id = ?', [referringUserId], (err, referrerRow) => {
        if (err) {
            console.error(err);
            return;
        }

        if (referrerRow && referrerRow.chat_id) {
            const referrerChatId = referrerRow.chat_id;
            const notificationMessage = `🎉 Hey! ${referredUsername} has registered using your referral link! 🚀`;

            bot.sendMessage(referrerChatId, notificationMessage);
        }
    });
}

// Helper function to generate a referral code
function generateReferralCode() {
    return Math.random().toString(36).substr(2, 8);
}

// Helper function to generate a referral link
function generateReferralLink(referralCode) {
    return `t.me/Metan600bot?start=${referralCode}`;
}

// Start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    const opts = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: '❤ Play', callback_data: 'play' }],
            ],
        }),
    };

    db.get('SELECT * FROM users WHERE chat_id = ?', [chatId], (err, row) => {
        if (err) {
            console.error(err);
            return;
        }

        if (row) {
            const balanceMessage = `Welcome back! Your current balance: ${row.balance} coins`;
            bot.sendMessage(chatId, balanceMessage, opts);
        } else {
            const referralCode = generateReferralCode(); // Generate referral code
            db.run(
                'INSERT OR REPLACE INTO users (chat_id, username, referral_code) VALUES (?, ?, ?)',
                [chatId, username, referralCode],
                (err) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    bot.sendMessage(chatId, welcomeMessage, opts);
                }
            );
        }
    });
});

// Callback query handling
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'play') {
        // Send photo and play message for the 'play' option
        const picturePath = './metan.jpeg';
        const photoStream = fs.createReadStream(picturePath);

        const playMessage = `It's playtime! 🎮`;
        const playOpts = {
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        {
                            text: 'Click to Gain More Coins',
                            callback_data: 'gain_coins',
                        },
                    ],
                    [
                        {
                            text: 'Share to Friend',
                            callback_data: 'share_to_friend',
                        },
                    ],
                ],
            }),
        };

        bot.sendPhoto(chatId, photoStream, { caption: playMessage, reply_markup: playOpts.reply_markup });
    } else if (query.data === 'gain_coins') {
        db.get('SELECT balance FROM users WHERE chat_id = ?', [chatId], (err, row) => {
            if (err) {
                console.error(err);
                return;
            }

            const currentBalance = row.balance;

            db.run('UPDATE users SET balance = ? WHERE chat_id = ?', [currentBalance + 1, chatId], (err) => {
                if (err) {
                    console.error(err);
                    return;
                }

                const playMessage = `Your balance has been increased to ${currentBalance + 1} coins! 🎉\n\nIt's playtime! 🎮`;
                const playOpts = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [
                                {
                                    text: 'Click to Gain More Coins',
                                    callback_data: 'gain_coins',
                                },
                            ],
                        ],
                    }),
                };

                bot.sendMessage(chatId, playMessage, playOpts);
            });
        });

    } else if (query.data === 'share_to_friend') {
        // Generate referral link using the user's chat ID
        const referralLink = generateReferralLink(chatId); // Use chatId as the referral code for simplicity
        const shareMessage = `📢 Share this referral link with your friends:\n\n${referralLink}\n\nFor each friend who joins, you'll receive a bonus of 100 coins! 🎉`;
        bot.sendMessage(chatId, shareMessage, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/profile/, (msg) => {
    const chatId = msg.chat.id;

    // Get user profile from the database
    db.get('SELECT * FROM users WHERE chat_id = ?', [chatId], (err, row) => {
        if (err) {
            console.error(err);
            return;
        }

        if (row) {
            const username = row.username;
            const balance = row.balance;
            const referralCode = row.referral_code;
            const referralLink = generateReferralLink(referralCode);

            const profileMessage = `👤 *Profile*\n\nUsername: ${username}\nBalance: ${balance} coins\nReferral Link: [${referralLink}](${referralLink})`;

            bot.sendMessage(chatId, profileMessage, { parse_mode: 'Markdown' });
        } else {
            // Handle the case when the user is not found in the database
            bot.sendMessage(chatId, 'User not found. Please use /start to register.');
        }
    });
});

bot.onText(/\/mysquad/, (msg) => {
    const chatId = msg.chat.id;

    // Get user and their referrals from the database
    db.get('SELECT * FROM users WHERE chat_id = ?', [chatId], (err, userRow) => {
        if (err) {
            console.error(err);
            return;
        }

        if (userRow) {
            const userId = userRow.user_id;

            // Get referrals for the user
            db.all('SELECT * FROM referrals WHERE referring_user = ?', [userId], (err, referralRows) => {
                if (err) {
                    console.error(err);
                    return;
                }

                if (referralRows.length > 0) {
                    // User has referrals
                    let squadMessage = `👥 *My Squad*\n\n`;

                    referralRows.forEach((referral) => {
                        squadMessage += `Username: ${referral.referred_user}\n`;
                    });

                    squadMessage += `\nTotal Referrals: ${referralRows.length}`;

                    bot.sendMessage(chatId, squadMessage, { parse_mode: 'Markdown' });
                } else {
                    // User has no referrals
                    bot.sendMessage(chatId, 'You do not have any referrals. Share your referral link to build your squad!');
                }
            });
        } else {
            // Handle the case when the user is not found in the database
            bot.sendMessage(chatId, 'User not found. Please use /start to register.');
        }
    });
});

// /fren command to get the referral link
bot.onText(/\/fren/, (msg) => {
    const chatId = msg.chat.id;

    // Get the user's referral code from the database
    db.get('SELECT referral_code FROM users WHERE chat_id = ?', [chatId], (err, row) => {
        if (err) {
            console.error(err);
            return;
        }

        if (row && row.referral_code) {
            const referralCode = row.referral_code;
            const referralLink = generateReferralLink(referralCode);

            const referralMessage = `📢 Your Referral Link:\n\n${referralLink}\n\nFor each friend who joins, you'll receive a bonus of 100 coins! 🎉`;

            bot.sendMessage(chatId, referralMessage, { parse_mode: 'Markdown' });
        } else {
            // User not found or referral link not available
            const startMessage = 'User not found or referral link not available. Please use /start to register.';
            bot.sendMessage(chatId, startMessage);
        }
    });
});



bot.onText(/\/squad15/, (msg) => {
    const chatId = msg.chat.id;

    // Get top 15 users with the highest number of referrals
    db.all('SELECT users.username, COUNT(referrals.referred_user) AS referral_count ' +
        'FROM users ' +
        'LEFT JOIN referrals ON users.user_id = referrals.referring_user ' +
        'GROUP BY users.user_id ' +
        'ORDER BY referral_count DESC ' +
        'LIMIT 15', [], (err, rows) => {
            if (err) {
                console.error(err);
                return;
            }

            if (rows.length > 0) {
                // Users with the highest number of referrals found
                let squad15Message = `👥 *Top 15 Squads*\n\n`;

                rows.forEach((user) => {
                    squad15Message += `Username: ${user.username}\nReferral Count: ${user.referral_count}\n\n`;
                });

                bot.sendMessage(chatId, squad15Message, { parse_mode: 'Markdown' });
            } else {
                // No users with referrals found
                bot.sendMessage(chatId, 'Build your squad first by inviting friends using your referral link.');
            }
        });
});

bot.onText(/\/top15/, (msg) => {
    const chatId = msg.chat.id;

    // Get top 15 users with the highest balance
    db.all('SELECT username, balance ' +
        'FROM users ' +
        'ORDER BY balance DESC ' +
        'LIMIT 15', [], (err, rows) => {
            if (err) {
                console.error(err);
                return;
            }

            if (rows.length > 0) {
                // Users with the highest balances found
                let top15Message = `💰 *Top 15 Users*\n\n`;

                rows.forEach((user) => {
                    top15Message += `Username: ${user.username}\nBalance: ${user.balance} coins\n\n`;
                });

                bot.sendMessage(chatId, top15Message, { parse_mode: 'Markdown' });
            } else {
                // No users with balances found
                bot.sendMessage(chatId, 'No top users available. Play the game and earn coins to make it to the top!');
            }
        });
});



bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;

    const helpMessage = `
🚀 *Welcome to Moonshot Capital Squad! An Epic Adventure Awaits!*

Embark on a thrilling journey through the cosmos with Moonshot Capital Squad. Here's your guide to mastering the game and reaching new heights:

1. **Get Started 🌌**: Type /start to officially join the squad. Receive a warm welcome and your initial stash of coins. Brace yourself for the excitement!

2. **Play the Game 🎮**: Engage in epic quests by hitting the "❤ Play" button. Choose options like "Click to Gain More Coins" for instant rewards or "Share to Friend" to invite fellow explorers.

3. **Build Your Squad 🤝**: Execute the /fren command to unveil your exclusive referral link. Share this link with friends, and for each intrepid soul who joins, you'll be rewarded with a bonus of 100 coins!

4. **Top the Leaderboards 🏆**: Keep an eye on your progress! Use /top15 to discover the top 15 users with the most coins and /squad15 to unveil the most influential squads in the cosmos.

5. **View Your Profile 📊**: Curious about your journey stats? Utilize the /profile command to access vital information, including your username, current balance, and referral link.

6. **Get Assistance 🆘**: Feeling lost? Type /help anytime to revisit this guide and get the assistance you need.

Ready to become a cosmic legend? The universe awaits your conquest! Soar to unimaginable heights and make Moonshot Capital Squad history! 🌠🚀
`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});



// Other commands
// ... (Add your other commands here)

bot.setMyCommands([
    { command: 'start', description: 'Start' },
    { command: 'profile', description: 'Show my profile stats' },
    { command: 'mysquad', description: 'Show stats about your squad' },
    { command: 'top15', description: 'Top 15 users by earned coins' },
    { command: 'squad15', description: 'Top 15 squads by score' },
    { command: 'fren', description: 'Get your referral link' },
    { command: 'add', description: 'Add your friend refferal link' },
    { command: 'help', description: 'How to play' },
]);

console.log('Bot is running...');


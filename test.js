const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const app = express();
const port = 3000;
const cors = require('cors');
app.use(cors());
app.use(express.json());

const botToken = '6856707277:AAGtypS3sommjxK-er7Bm9ib5gJSoPChaCM';
const bot = new TelegramBot(botToken, { polling: true });
const db = new sqlite3.Database('users.db');

// Create a users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    chat_id INTEGER UNIQUE,
    username TEXT,
    balance INTEGER DEFAULT 3000,
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

app.get('/api/user-info/:chatId', (req, res) => {
    const chatId = req.params.chatId;

    // Asynchronous operation (e.g., querying the database) that can throw an error
    db.get('SELECT username, balance FROM users WHERE chat_id = ?', [chatId], (err, row) => {
        if (err) {
            console.error(`Error retrieving user information for chat ID ${chatId}: ${err}`);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        const userInfo = {
            username: row ? row.username : null,
            balance: row ? row.balance : null
        };

        res.json(userInfo);
    });
});


app.get('/api/top15', (req, res) => {
    const query = 'SELECT user_id, username, balance FROM users ORDER BY balance DESC LIMIT 15';

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error(`Error retrieving top 15 users: ${err}`);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        res.json(rows);
    });
});

app.post('/api/update-balance/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    const { balance } = req.body;

    // Debugging: Log received chatId
    console.log("Received chatId:", chatId);

    // Validate that chatId is a valid number
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'Invalid chatId' });
    }

    // Validate that balance is a valid number
    if (isNaN(balance)) {
        return res.status(400).json({ error: 'Invalid balance value' });
    }


    db.run('UPDATE users SET balance = ? WHERE chat_id = ?', [balance, chatId], function (err) {
        if (err) {
            console.error(`Error updating balance for chat ID ${chatId}: ${err}`);
            return res.status(500).json({ error: 'Internal Server Error' });
        }




        if (this.changes > 0) {
            return res.json({ success: true, message: 'Balance updated successfully' });
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    });
});

app.get('/api/all-chat-ids', (req, res) => {
    // Asynchronous operation (e.g., querying the database) that can throw an error
    db.all('SELECT chat_id FROM users ORDER BY chat_id ASC', (err, rows) => {
        if (err) {
            console.error(`Error retrieving chat IDs: ${err}`);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        const chatIDs = rows.map(row => row.chat_id);

        res.json({ chatIDs });
    });
});
// Function to notify referrer when someone registers using their link
async function notifyReferrer(referringUserId, referredUsername) {
    try {
        const referrerRow = await db.get('SELECT chat_id FROM users WHERE user_id = ?', [referringUserId]);

        if (referrerRow && referrerRow.chat_id) {
            const referrerChatId = referrerRow.chat_id;
            const notificationMessage = `🎉 Hey! ${referredUsername} has registered using your referral link! 🚀`;

            bot.sendMessage(referrerChatId, notificationMessage);
        }
    } catch (err) {
        console.error(err);
    }
}


function generateReferralLink(referralCode) {
    return `t.me/Actric_bot?start=${referralCode}`;
}

// Helper function to generate a referral code
function generateReferralCode() {
    return Math.random().toString(36).substr(2, 8);
}


async function checkExistingReferral(chatId, referringUserId, referredUser) {
    // Check if the referral link already exists in the squad
    db.get('SELECT * FROM referrals WHERE referring_user = ? AND referred_user = ?', [referringUserId, referredUser.user_id], (err, existingReferral) => {
        if (err) {
            console.error(err);
            return;
        }

        if (!existingReferral) {
   
            if (referringUserId === referredUser.user_id) {
                console.error('Error: The referring user and referred user are the same.');
                return;
            }

 
            db.run('INSERT INTO referrals (referring_user, referred_user) VALUES (?, ?)', [referringUserId, referredUser.user_id], (err) => {
                if (err) {
                    console.error(err);
                    return;
                }

           
                db.run('UPDATE users SET balance = balance + 3000 WHERE user_id IN (?, ?)', [chatId, referredUser.user_id], (err) => {
                    if (err) {
                        console.error('Error updating balance:', err);
                        return;
                    }

                    console.log(`Successfully added ${referredUser.username} to ${chatId}'s squad!`);

                 
                    bot.sendMessage(referredUser.chat_id, `🎉 You have been successfully added to ${referredUser.username}'s squad! You earned 3000 coins! 🎉`);
                });
            });
        } else {
         
            console.log(`${referredUser.username} is already in ${chatId}'s squad.`);
        }
    });
}



async function getUserByReferralCode(referralCode) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE referral_code = ?', [referralCode], (err, user) => {
            if (err) {
                console.error('Error retrieving user by referral code:', err);
                reject(err);
            } else {
                console.log('Retrieved user by referral code:', user);
                resolve(user);
            }
        });
    });
}


bot.onText(/\/start(.+)/, (msg, match) => {
    try {
        const chatId = msg.chat.id;
        const referralCode = match[1].trim();

        getUserByReferralCode(referralCode)
            .then((referredUser) => {
                if (referredUser) {
                    const referringUserId = chatId;
                    console.log('User Found:', referringUserId);
                    checkExistingReferral(chatId, referringUserId, referredUser);
                } else {
                    // Referral code does not exist
                    console.log('Referral code not found:', referralCode);
                    bot.sendMessage(chatId, 'Referral code not found. Please check the code and try again.');
                }
            })
            .catch((error) => {
                console.error('Error in /start command:', error);
                bot.sendMessage(chatId, 'An error occurred while processing your request. Please try again later.');
            });
    } catch (error) {
        console.error('Unexpected error:', error);
    }
});


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    // Check if the user is already in the database
    db.get('SELECT * FROM users WHERE chat_id = ?', [chatId], (err, existingUser) => {
        if (err) {
            console.error(err);
            return;
        }

        if (!existingUser) {
            // User is not in the database, so add them
            const referralCode = generateReferralCode();

            db.run(
                'INSERT INTO users (chat_id, username, balance, referral_code) VALUES (?, ?, ?, ?)',
                [chatId, username, 3000, referralCode],
                (insertErr) => {
                    if (insertErr) {
                        console.error(insertErr);
                        return;
                    }

                    // Newly added user, send welcome message
                    sendWelcomeMessage(chatId, username, referralCode);
                }
            );
        } else {
            // User is already in the database, send the same welcome message
            sendWelcomeMessage(chatId, username, existingUser.referral_code);
        }
    });
});

function sendWelcomeMessage(chatId, username, referralCode) {
    
    const referralLink = generateReferralLink(referralCode);

    const welcomeMessage = `Welcome${username ? ', ' + username : ''}! 🎉\n\n`
        + 'You’ve joined the Moonshot Capital Squad!\n\n'
        + 'Now it\'s time to get to the top! 🏆\n\n'
        + 'Click the *Let\'s Go* button below to Start.\n\n'
        + `Your referral link is: [${referralLink}](${referralLink})`;

    // Send the welcoming image along with two buttons
    const imageFilePath = './metan.jpeg'; // Replace with the path to your image file
    const imageStream = fs.createReadStream(imageFilePath);

    const opts = {
        caption: welcomeMessage,
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    { text: "Let's Go", web_app: { url: `https://metancoin.pages.dev/` } },
                    { text: 'How to play', callback_data: 'how_to_play' },
                ],
            ],
        }),
        parse_mode: 'Markdown',
    };

    bot.sendPhoto(chatId, imageStream, opts);
}

// Callback query handling
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'how_to_play') {
        // Handle the "How to play" button callback
        bot.sendMessage(chatId, 'To play, follow these instructions:\n' + '\fren');
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

bot.onText(/\/add (\w+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const referralCode = match[1];
  
    // Check if the referral code exists in the database
    db.get('SELECT * FROM users WHERE referral_code = ?', [referralCode], (err, row) => {
      if (err) {
        console.error(err);
        return;
      }
  
      if (row) {
        // Referral code exists, add it to the user's referrals
        db.run('INSERT INTO referrals (referring_user, referred_user) VALUES (?, ?)', [chatId, row.user_id], (err) => {
          if (err) {
            console.error(err);
            return;
          }
  
          // Notify the referrer that someone has joined using their referral link
          notifyReferrer(row.user_id, msg.from.username);
  
          // Send a success message to the user
          bot.sendMessage(chatId, 'Successfully added referral link!');
        });
      } else {
        // Referral code does not exist
        bot.sendMessage(chatId, 'Referral code not found. Please check the code and try again.');
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

2. **Play the Game 🎮**: Engage in epic quests by hitting the "❤ Let's Go" button. Choose options like "Click to Gain More Coins" for instant rewards or "Share to Friend" to invite fellow explorers.

3. **Build Your Squad 🤝**: Execute the /fren command to unveil your exclusive referral link. Share this link with friends, and for each intrepid soul who joins, you'll be rewarded with a bonus of 100 coins!

4. **Top the Leaderboards 🏆**: Keep an eye on your progress! Use /top15 to discover the top 15 users with the most coins and /squad15 to unveil the most influential squads in the cosmos.

5. **View Your Profile 📊**: Curious about your journey stats? Utilize the /profile command to access vital information, including your username, current balance, and referral link.

6. **Get Assistance 🆘**: Feeling lost? Type /help anytime to revisit this guide and get the assistance you need.

Ready to become a cosmic legend? The universe awaits your conquest! Soar to unimaginable heights and make Moonshot Capital Squad history! 🌠🚀
`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});


bot.setMyCommands([
    { command: 'start', description: 'Start' },
    { command: 'profile', description: 'Show my profile stats' },
    { command: 'mysquad', description: 'Show stats about your squad' },
    { command: 'top15', description: 'Top 15 users by earned coins' },
    { command: 'squad15', description: 'Top 15 squads by score' },
    { command: 'fren', description: 'Get your referral link' },
    { command: 'help', description: 'How to play' },
]);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
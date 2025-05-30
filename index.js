const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');

// Замените 'YOUR_BOT_TOKEN' на токен, полученный от BotFather
const token = '7559641294:AAFHg-8ygjyqF2LhttAYDnid4SFN6rMvQYg'
const bot = new TelegramBot(token, { polling: true });

// URL для CoinGecko API
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Инициализация Chart.js для рендеринга графиков
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600 });

// Хранилище истории запросов и состояния пользователей
const userHistory = {};
const userState = {};

// Списки валют
const supportedCrypto = [
  'bitcoin', 'ethereum', 'litecoin', 'ripple', 'cardano',
  'solana', 'polkadot', 'chainlink', 'dogecoin', 'shiba-inu',
  'binancecoin', 'tether', 'usd-coin', 'avalanche-2', 'stellar',
  'tron', 'cosmos', 'algorand', 'vechain', 'theta-token',
  'monero', 'tezos', 'eos', 'hedera-hashgraph', 'aave',
  'filecoin', 'maker', 'compound-governance-token', 'near', 'arweave'
];

const supportedFiat = [
  'usd', 'eur', 'rub', 'gbp', 'jpy',
  'cad', 'aud', 'chf', 'cny', 'inr',
  'brl', 'krw', 'sgd', 'nzd', 'mxn'
];

const tickerMap = {
  'btc': 'bitcoin', 'eth': 'ethereum', 'ltc': 'litecoin', 'xrp': 'ripple', 'ada': 'cardano',
  'sol': 'solana', 'dot': 'polkadot', 'link': 'chainlink', 'doge': 'dogecoin', 'shib': 'shiba-inu',
  'bnb': 'binancecoin', 'usdt': 'tether', 'usdc': 'usd-coin', 'avax': 'avalanche-2', 'xlm': 'stellar',
  'trx': 'tron', 'atom': 'cosmos', 'algo': 'algorand', 'vet': 'vechain', 'theta': 'theta-token',
  'xmr': 'monero', 'xtz': 'tezos', 'eos': 'eos', 'hbar': 'hedera-hashgraph', 'aave': 'aave',
  'fil': 'filecoin', 'mkr': 'maker', 'comp': 'compound-governance-token', 'near': 'near', 'ar': 'arweave'
};

// Основная клавиатура
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['💸 Конвертировать', '📈 График цен'],
      ['📜 История', '📋 Список валют'],
      ['ℹ️ Справка']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `👋 *Добро пожаловать в Crypto Converter Bot!*  
Выбери действие на клавиатуре ниже:`, {
    parse_mode: 'Markdown',
    ...mainKeyboard
  });
});

// Обработчик команды /help и кнопки "Справка"
bot.onText(/\/help|ℹ️ Справка/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `ℹ️ *Справка по Crypto Converter Bot*  

Я помогу конвертировать криптовалюты, смотреть графики цен и историю запросов.  

🔹 *Как пользоваться:*  
1. Нажми *💸 Конвертировать* и следуй подсказкам (введи сумму, выбери валюты).  
2. Нажми *📈 График цен* для графика цен криптовалюты за 7 дней.  
3. Нажми *📜 История* для просмотра последних 5 конвертаций.  
4. Нажми *📋 Список валют* для всех доступных валют.  

🔹 *Подсказка:*  
- Используй кнопки для удобства.  
- Если что-то не работает, напиши мне! 😊`, {
    parse_mode: 'Markdown',
    ...mainKeyboard
  });
});

// Обработчик команды /list и кнопки "Список валют"
bot.onText(/\/list|📋 Список валют/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `💰 *Поддерживаемые валюты*  

*Криптовалюты:*  
${supportedCrypto.map(c => `${c} (${tickerMap[Object.keys(tickerMap).find(k => tickerMap[k] === c)]?.toUpperCase()})`).join(', ')}  

*Фиатные валюты:*  
${supportedFiat.join(', ').toUpperCase()}`, {
    parse_mode: 'Markdown',
    ...mainKeyboard
  });
});

// Обработчик команды /history и кнопки "История"
bot.onText(/\/history|📜 История/, (msg) => {
  const chatId = msg.chat.id;
  const history = userHistory[chatId] || [];
  if (history.length === 0) {
    bot.sendMessage(chatId, `📜 *История запросов*  
У тебя пока нет конвертаций. Нажми *💸 Конвертировать*!`, {
      parse_mode: 'Markdown',
      ...mainKeyboard
    });
    return;
  }
  const historyText = history.slice(-5).map((entry, index) => 
    `${index + 1}. ${entry.amount} ${entry.from.toUpperCase()} = ${entry.result} ${entry.to.toUpperCase()} (${entry.date})`
  ).join('\n');
  bot.sendMessage(chatId, `📜 *Последние конвертации* (до 5):  
${historyText}`, {
    parse_mode: 'Markdown',
    ...mainKeyboard
  });
});

// Обработчик команды /price и кнопки "График цен"
bot.onText(/\/price|📈 График цен/, (msg) => {
  const chatId = msg.chat.id;
  const popularCrypto = ['bitcoin', 'ethereum', 'solana', 'cardano', 'dogecoin'];
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        popularCrypto.map(crypto => ({
          text: tickerMap[Object.keys(tickerMap).find(k => tickerMap[k] === crypto)].toUpperCase(),
          callback_data: `price_${crypto}`
        })),
        [{ text: '📋 Другие валюты', callback_data: 'list' }]
      ]
    }
  };
  bot.sendMessage(chatId, `📈 *Выбери криптовалюту для графика цен (за 7 дней):*`, {
    parse_mode: 'Markdown',
    ...inlineKeyboard
  });
});

// Обработчик команды /convert и кнопки "Конвертировать"
bot.onText(/\/convert|💸 Конвертировать/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 'amount' };
  bot.sendMessage(chatId, `💸 *Введи сумму для конвертации (например, 1 или 0.5):*`, {
    parse_mode: 'Markdown',
    reply_markup: { keyboard: [], resize_keyboard: true, one_time_keyboard: true }
  });
});

// Обработчик текстовых сообщений для пошаговой конвертации
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId] || text.startsWith('/')) return;

  const state = userState[chatId];

  if (state.step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, `❌ *Неверная сумма!* Введи число, например, 1 или 0.5.`, {
        parse_mode: 'Markdown',
        ...mainKeyboard
      });
      return;
    }
    state.amount = amount;
    state.step = 'fromCurrency';

    const popularCurrencies = ['bitcoin', 'ethereum', 'usd', 'eur'];
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          popularCurrencies.map(c => ({
            text: (tickerMap[Object.keys(tickerMap).find(k => tickerMap[k] === c)] || c).toUpperCase(),
            callback_data: `from_${c}`
          })),
          [{ text: '📋 Другие валюты', callback_data: 'list' }]
        ]
      }
    };
    bot.sendMessage(chatId, `💱 *Выбери валюту, из которой конвертировать:*`, {
      parse_mode: 'Markdown',
      ...inlineKeyboard
    });
  }
});

// Обработчик inline-кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'list') {
    bot.sendMessage(chatId, `💰 *Поддерживаемые валюты*  

*Криптовалюты:*  
${supportedCrypto.map(c => `${c} (${tickerMap[Object.keys(tickerMap).find(k => tickerMap[k] === c)]?.toUpperCase()})`).join(', ')}  

*Фиатные валюты:*  
${supportedFiat.join(', ').toUpperCase()}`, {
      parse_mode: 'Markdown',
      ...mainKeyboard
    });
  } else if (data.startsWith('price_')) {
    const currency = data.replace('price_', '');
    try {
      const response = await axios.get(`${COINGECKO_API}/coins/${currency}/market_chart`, {
        params: { vs_currency: 'usd', days: 7 }
      });
      const prices = response.data.prices;
      const labels = prices.map(p => new Date(p[0]).toLocaleDateString());
      const data = prices.map(p => p[1]);

      const configuration = {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: `${currency.toUpperCase()} Price (USD)`,
            data,
            borderColor: '#1e90ff',
            fill: false
          }]
        },
        options: {
          scales: {
            x: { title: { display: true, text: 'Date' } },
            y: { title: { display: true, text: 'Price (USD)' } }
          }
        }
      };

      const imageStream = await chartJSNodeCanvas.renderToBuffer(configuration);
      fs.writeFileSync('chart.png', imageStream);
      bot.sendPhoto(chatId, 'chart.png', {
        caption: `📈 *График цен ${currency.toUpperCase()} за 7 дней (в USD)*`,
        parse_mode: 'Markdown',
        ...mainKeyboard
      });
    } catch (error) {
      bot.sendMessage(chatId, `😔 Ошибка при получении данных графика. Попробуй позже.`, {
        parse_mode: 'Markdown',
        ...mainKeyboard
      });
      console.error(error);
    }
  } else if (data.startsWith('from_')) {
    const fromCurrency = data.replace('from_', '');
    userState[chatId].fromCurrency = fromCurrency;
    userState[chatId].step = 'toCurrency';

    const popularCurrencies = ['usd', 'eur', 'bitcoin', 'ethereum'].filter(c => c !== fromCurrency);
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          popularCurrencies.map(c => ({
            text: (tickerMap[Object.keys(tickerMap).find(k => tickerMap[k] === c)] || c).toUpperCase(),
            callback_data: `to_${c}`
          })),
          [{ text: '📋 Другие валюты', callback_data: 'list' }]
        ]
      }
    };
    bot.sendMessage(chatId, `💱 *Выбери валюту, в которую конвертировать:*`, {
      parse_mode: 'Markdown',
      ...inlineKeyboard
    });
  } else if (data.startsWith('to_')) {
    const toCurrency = data.replace('to_', '');
    const { amount, fromCurrency } = userState[chatId];

    if (fromCurrency === toCurrency) {
      bot.sendMessage(chatId, `❌ *Нельзя конвертировать валюту в саму себя!*  
Выбери другую валюту.`, {
        parse_mode: 'Markdown',
        ...mainKeyboard
      });
      delete userState[chatId];
      return;
    }

    try {
      let result;
      if (supportedCrypto.includes(fromCurrency) && supportedFiat.includes(toCurrency)) {
        const response = await axios.get(`${COINGECKO_API}/simple/price`, {
          params: { ids: fromCurrency, vs_currencies: toCurrency }
        });
        const price = response.data[fromCurrency][toCurrency];
        result = amount * price;
        bot.sendMessage(chatId, `✅ *Результат конвертации*  
${amount} ${fromCurrency.toUpperCase()} = *${result.toFixed(2)} ${toCurrency.toUpperCase()}*`, {
          parse_mode: 'Markdown',
          ...mainKeyboard
        });
      } else if (supportedFiat.includes(fromCurrency) && supportedCrypto.includes(toCurrency)) {
        const response = await axios.get(`${COINGECKO_API}/simple/price`, {
          params: { ids: toCurrency, vs_currencies: fromCurrency }
        });
        const price = response.data[toCurrency][fromCurrency];
        result = amount / price;
        bot.sendMessage(chatId, `✅ *Результат конвертации*  
${amount} ${fromCurrency.toUpperCase()} = *${result.toFixed(8)} ${toCurrency.toUpperCase()}*`, {
          parse_mode: 'Markdown',
          ...mainKeyboard
        });
      } else if (supportedCrypto.includes(fromCurrency) && supportedCrypto.includes(toCurrency)) {
        const response = await axios.get(`${COINGECKO_API}/simple/price`, {
          params: { ids: `${fromCurrency},${toCurrency}`, vs_currencies: 'usd' }
        });
        const fromPrice = response.data[fromCurrency].usd;
        const toPrice = response.data[toCurrency].usd;
        result = (amount * fromPrice) / toPrice;
        bot.sendMessage(chatId, `✅ *Результат конвертации*  
${amount} ${fromCurrency.toUpperCase()} = *${result.toFixed(8)} ${toCurrency.toUpperCase()}*`, {
          parse_mode: 'Markdown',
          ...mainKeyboard
        });
      } else {
        bot.sendMessage(chatId, `⚠️ Конвертация между двумя фиатными валютами не поддерживается.`, {
          parse_mode: 'Markdown',
          ...mainKeyboard
        });
        delete userState[chatId];
        return;
      }

      // Сохранение в историю
      if (!userHistory[chatId]) userHistory[chatId] = [];
      userHistory[chatId].push({
        amount,
        from: fromCurrency,
        to: toCurrency,
        result: result.toFixed(8),
        date: new Date().toLocaleString()
      });
    } catch (error) {
      bot.sendMessage(chatId, `😔 Ошибка при получении данных.  
Попробуй позже или выбери другие валюты.`, {
        parse_mode: 'Markdown',
        ...mainKeyboard
      });
      console.error(error);
    }
    delete userState[chatId];
  }

  bot.answerCallbackQuery(query.id);
});

// Обработчик ошибок polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Бот запущен...');
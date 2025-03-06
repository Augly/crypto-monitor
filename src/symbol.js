const Binance = require('binance-api-node').default;
const client = Binance();

class SymbolManager {
    constructor() {
        this.top50Symbols = [];
        this.updateInterval = 24 * 60 * 60 * 1000; // 24小时更新一次
    }

    async initialize() {
        await this.updateTop50Symbols();
        // 每24小时更新一次交易对列表
        setInterval(() => this.updateTop50Symbols(), this.updateInterval);
    }

    async updateTop50Symbols() {
        try {
            const tickers = await client.futuresDailyStats();
            
            this.top50Symbols = tickers
                .filter(ticker => ticker.symbol.endsWith('USDT'))
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, 50)
                .map(ticker => ({
                    symbol: ticker.symbol,
                    volume: parseFloat(ticker.quoteVolume),
                    price: parseFloat(ticker.lastPrice)
                }));

            console.log('已更新前50个USDT交易对列表');
            console.log('交易量最大的前5个交易对:');
            this.top50Symbols.slice(0, 5).forEach((pair, index) => {
                console.log(`${index + 1}. ${pair.symbol} - 24h交易量: ${pair.volume.toFixed(2)} USDT`);
            });

            return this.top50Symbols;
        } catch (error) {
            console.error('获取交易对列表失败:', error);
            throw error;
        }
    }

    getTop50Symbols() {
        return this.top50Symbols.map(item => item.symbol);
    }
}

module.exports = SymbolManager;
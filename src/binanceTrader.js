const Binance = require('binance-api-node').default;

class BinanceTrader {
    constructor(apiKey, apiSecret) {
        this.client = Binance({
            apiKey: apiKey,
            apiSecret: apiSecret,
            futures: true // 使用合约API
        });
    }

    async openPosition(symbol, side, quantity, options = {}) {
        try {
            // 设置杠杆
            await this.client.futuresLeverage({
                symbol: symbol,
                leverage: options.leverage || 5
            });

            // 开仓订单
            const order = await this.client.futuresOrder({
                symbol: symbol,
                side: side === 'LONG' ? 'BUY' : 'SELL',
                type: 'MARKET',
                quantity: quantity.toString(),
            });

            // 设置止盈止损
            if (options.stopLoss) {
                await this.client.futuresOrder({
                    symbol: symbol,
                    side: side === 'LONG' ? 'SELL' : 'BUY',
                    type: 'STOP_MARKET',
                    stopPrice: options.stopLoss.toString(),
                    closePosition: true
                });
            }

            if (options.takeProfit) {
                await this.client.futuresOrder({
                    symbol: symbol,
                    side: side === 'LONG' ? 'SELL' : 'BUY',
                    type: 'TAKE_PROFIT_MARKET',
                    stopPrice: options.takeProfit.toString(),
                    closePosition: true
                });
            }

            return order;
        } catch (error) {
            console.error('开仓失败:', error);
            throw error;
        }
    }

    async closePosition(symbol, side, quantity) {
        try {
            return await this.client.futuresOrder({
                symbol: symbol,
                side: side === 'LONG' ? 'SELL' : 'BUY',
                type: 'MARKET',
                quantity: quantity.toString(),
            });
        } catch (error) {
            console.error('平仓失败:', error);
            throw error;
        }
    }
}

module.exports = BinanceTrader;
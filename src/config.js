module.exports = {
    trading: {
        leverage: 5,
        positionSize: 100,
        stopLoss: 0.02,
        takeProfit: 0.04,
        maxPositions: 5
    },
    scoreWeights: {
        trend: 0.3,
        momentum: 0.2,
        volatility: 0.2,
        volume: 0.15,
        support: 0.15
    },
    signalThresholds: {
        strongBuy: 80,
        buy: 60,
        neutral: 40,
        sell: 20
    },
    system: {
        updateInterval: 24 * 60 * 60 * 1000, // 交易对列表更新间隔
        dataRetention: 200, // 保留200天数据
        maxReconnectAttempts: 5,
        reconnectInterval: 5000
    },
    notifications: {
        enabled: true,
        channels: ['console']
    }
};
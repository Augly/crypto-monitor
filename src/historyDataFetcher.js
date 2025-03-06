const Binance = require("binance-api-node").default;
const DataStore = require("./dataStore");

class HistoryDataFetcher {
    constructor() {
        this.client = Binance();
        this.dataStore = new DataStore();
    }

    async getAllFuturesSymbols() {
        try {
            const exchangeInfo = await this.client.futuresExchangeInfo();
            return exchangeInfo.symbols
                .filter(
                    (symbol) =>
                        symbol.status === "TRADING" && symbol.quoteAsset === "USDT"
                )
                .map((symbol) => symbol.symbol);
        } catch (error) {
            console.error("获取合约列表失败:", error);
            return [];
        }
    }

    async fetchHistoricalKlines(symbol, interval, startTime, endTime) {
        try {
            const klines = await this.client.futuresCandles({
                symbol: symbol,
                interval: interval,
                startTime: startTime,
                endTime: endTime,
                limit: 1000,
            });
            return klines;
        } catch (error) {
            console.error(`获取历史K线失败: ${symbol} ${interval}`, error);
            return [];
        }
    }

    getIntervalMilliseconds(interval) {
        const units = {
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
        };
        const value = parseInt(interval);
        const unit = interval.slice(-1);
        return value * units[unit];
    }

    async fetchHistoricalKlinesBatch(symbol, interval, startTime, endTime) {
        const intervalMs = this.getIntervalMilliseconds(interval);
        const batchSize = 1000 * intervalMs;
        let allKlines = [];
        let currentStartTime = startTime;

        while (currentStartTime < endTime) {
            const currentEndTime = Math.min(currentStartTime + batchSize, endTime);
            console.log(
                `获取 ${symbol} ${interval} 数据: ${new Date(
                    currentStartTime
                ).toISOString()} 到 ${new Date(currentEndTime).toISOString()}`
            );

            const klines = await this.fetchHistoricalKlines(
                symbol,
                interval,
                currentStartTime,
                currentEndTime
            );

            if (klines.length > 0) {
                // 直接在这里进行去重和排序
                const uniqueKlines = new Map();
                for (const kline of klines) {
                    uniqueKlines.set(kline.openTime, kline);
                }

                const sortedKlines = Array.from(uniqueKlines.values())
                    .sort((a, b) => a.openTime - b.openTime);

                allKlines = allKlines.concat(sortedKlines);
            }

            if (klines.length < 1000) {
                break;
            }

            currentStartTime = currentEndTime;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // 最后再进行一次整体去重和排序
        const finalUniqueKlines = new Map();
        for (const kline of allKlines) {
            finalUniqueKlines.set(kline.openTime, kline);
        }

        const finalSortedKlines = Array.from(finalUniqueKlines.values())
            .sort((a, b) => a.openTime - b.openTime);

        console.log(`处理完成，最终数据量 ${finalSortedKlines.length} 条`);

        return finalSortedKlines;
    }

    async fetchAllHistoricalData(symbols) {
        try {
            const intervals = ['1h']; // 只保留1小时级别
            const endTime = Date.now();
            const startTime = endTime - (200 * 24 * 60 * 60 * 1000); // 200天

            for (const symbol of symbols) {
                console.log(`获取 ${symbol} 的历史数据`);

                for (const interval of intervals) {
                    try {
                        const existingData = await this.dataStore.loadKlineData(symbol, interval);
                        const lastKlineTime = existingData && existingData.length > 0
                            ? existingData[existingData.length - 1].openTime
                            : null;

                        const actualStartTime = lastKlineTime ? lastKlineTime + 1 : startTime;

                        if (actualStartTime >= endTime) {
                            console.log(`${symbol} ${interval} 数据已是最新`);
                            continue;
                        }

                        console.log(`${symbol} ${interval} 获取数据，从 ${new Date(actualStartTime).toISOString()} 开始`);

                        const klines = await this.fetchHistoricalKlinesBatch(symbol, interval, actualStartTime, endTime);

                        if (klines && klines.length > 0) {
                            if (existingData && existingData.length > 0) {
                                const mergedData = [...existingData, ...klines];
                                const uniqueData = Array.from(
                                    new Map(mergedData.map(item => [item.openTime, item])).values()
                                ).sort((a, b) => a.openTime - b.openTime);
                                await this.dataStore.saveKlineData(symbol, interval, uniqueData);
                            } else {
                                await this.dataStore.saveKlineData(symbol, interval, klines);
                            }
                            console.log(`${symbol} ${interval} 数据保存成功，共 ${klines.length} 条`);
                        }
                    } catch (error) {
                        console.error(`获取 ${symbol} ${interval} 数据失败:`, error);
                    }

                    // 添加延迟以避免触发频率限制
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            console.log('所有历史数据获取完成');
        } catch (error) {
            console.error('获取历史数据失败:', error);
            throw error;
        }
    }

    async fetchLatestData() {
        try {
            const symbols = await this.getAllFuturesSymbols();
            const intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
            const endTime = Date.now();

            for (const symbol of symbols) {
                console.log(`开始更新 ${symbol} 的最新数据`);

                for (const interval of intervals) {
                    try {
                        const lastKlineTime = await this.dataStore.getLastKlineTime(
                            symbol,
                            interval
                        );
                        const startTime = lastKlineTime
                            ? lastKlineTime + 1
                            : endTime - 200 * 24 * 60 * 60 * 1000;

                        if (startTime >= endTime) {
                            console.log(`${symbol} ${interval} 数据已是最新`);
                            continue;
                        }

                        const klines = await this.fetchHistoricalKlinesBatch(
                            symbol,
                            interval,
                            startTime,
                            endTime
                        );
                        if (klines.length > 0) {
                            // 保存新数据到本地
                            await this.dataStore.appendKlineData(symbol, interval, klines);
                            console.log(
                                `完成更新 ${symbol} ${interval} 数据，新增 ${klines.length} 条`
                            );
                        }
                    } catch (error) {
                        console.error(`更新 ${symbol} ${interval} 数据失败:`, error);
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            console.log("最新数据更新完成");
        } catch (error) {
            console.error("更新最新数据失败:", error);
        }
    }
}

module.exports = HistoryDataFetcher;

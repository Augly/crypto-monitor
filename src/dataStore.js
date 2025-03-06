const fs = require('fs').promises;
const fsSync = require('fs');  // 添加同步版本的 fs
const path = require('path');

class DataStore {
    constructor() {
        this.dataPath = path.join(__dirname, '../data');
        this.ensureDataDirectory();
    }
    // 添加 getFilePath 方法
    getFilePath(symbol, interval) {
        return path.join(this.dataPath, `${symbol}_${interval}.json`);
    }
    async ensureDataDirectory() {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
        } catch (error) {
            console.error('创建数据目录失败:', error);
        }
    }

    async saveKlineData(symbol, interval, data) {
        try {
            if (!data || data.length === 0) {
                console.log(`没有数据需要保存: ${symbol} ${interval}`);
                return;
            }

            const filePath = this.getFilePath(symbol, interval);
            const dir = path.dirname(filePath);

            // 确保目录存在
            if (!fsSync.existsSync(dir)) {
                await fs.mkdir(dir, { recursive: true });
            }

            // 确保数据是有效的
            const validData = data.filter(kline =>
                kline &&
                kline.openTime &&
                kline.open &&
                kline.high &&
                kline.low &&
                kline.close &&
                kline.volume
            );

            if (validData.length === 0) {
                console.log(`没有有效数据需要保存: ${symbol} ${interval}`);
                return;
            }

            // 保存数据
            await fs.writeFile(filePath, JSON.stringify(validData, null, 2));
            console.log(`成功保存 ${symbol} ${interval} 数据到 ${filePath}`);
        } catch (error) {
            console.error(`保存数据失败: ${symbol} ${interval}`, error);
            throw error;
        }
    }

    async loadKlineData(symbol, interval) {
        try {
            const filePath = this.getFilePath(symbol, interval);
            if (!fsSync.existsSync(filePath)) {
                return null;
            }
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`加载数据失败: ${symbol} ${interval}`, error);
            return null;
        }
    }

    async appendKlineData(symbol, interval, newData) {
        try {
            const existingData = await this.loadKlineData(symbol, interval);

            // 去重和排序
            const allData = [...existingData, ...newData];
            const uniqueData = Array.from(
                new Map(allData.map(item => [item.openTime, item])).values()
            ).sort((a, b) => a.openTime - b.openTime);

            // 保存更新后的数据
            await this.saveKlineData(symbol, interval, uniqueData);

            console.log(`更新数据成功: ${symbol} ${interval}`);
        } catch (error) {
            console.error(`更新数据失败: ${symbol} ${interval}`, error);
        }
    }

    async getAllSymbols() {
        const files = await fs.readdir(this.dataPath);
        const symbols = new Set();
        files.forEach(file => {
            const symbol = file.split('_')[0];
            symbols.add(symbol);
        });
        return Array.from(symbols);
    }

    async getLastKlineTime(symbol, interval) {
        try {
            const data = await this.loadKlineData(symbol, interval);
            if (data && data.length > 0) {
                // 返回最后一条K线的时间
                return data[data.length - 1].openTime;
            }
            return null;
        } catch (error) {
            console.error(`获取最后K线时间失败: ${symbol} ${interval}`, error);
            return null;
        }
    }

    // 可选：添加一个检查数据是否存在的方法
    async checkIfHistoricalDataExists(symbol, interval) {
        try {
            const data = await this.loadKlineData(symbol, interval);
            return data && data.length > 0;
        } catch (error) {
            console.error(`检查历史数据失败: ${symbol} ${interval}`, error);
            return false;
        }
    }
}

module.exports = DataStore;
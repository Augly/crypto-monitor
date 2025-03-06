const HistoryDataFetcher = require("./historyDataFetcher");
const RealtimeMonitor = require("./realtimeMonitor");
const SymbolManager = require("./symbol");
const config = require("./config");

async function main() {
    try {
        // 初始化交易对管理器
        console.log("初始化交易对管理器...");
        const symbolManager = new SymbolManager();
        await symbolManager.initialize();

        // 获取前50个交易对
        const symbols = symbolManager.getTop50Symbols();
        console.log(`获取到 ${symbols.length} 个交易对`);

        // 获取历史数据
        console.log("开始获取历史数据...");
        const historyFetcher = new HistoryDataFetcher();
        await historyFetcher.fetchAllHistoricalData(symbols);

        // 启动实时监控
        console.log("启动实时监控...");
        const monitor = new RealtimeMonitor({
            symbols: symbols,
            ...config
        });

        // 优雅退出处理
        // process.on("SIGINT", async () => {
            // console.log("正在关闭程序...");
            // await monitor.close();
            // process.exit(0);
        // });

        // 处理未捕获的异常
        process.on("uncaughtException", async (error) => {
            console.error("未捕获的异常:", error);
            await monitor.close();
            process.exit(1);
        });

        await monitor.initialize();
    } catch (error) {
        console.error("程序运行错误:", error);
        process.exit(1);
    }
}

main();
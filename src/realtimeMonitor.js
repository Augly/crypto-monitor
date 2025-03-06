const WebSocket = require("ws");
const DataStore = require("./dataStore");
const TechnicalAnalysis = require("./TechnicalAnalysis");
const BinanceTrader = require("./binanceTrader");
const config = require("./config");
class RealtimeMonitor {
  constructor(userConfig = {}) {
    this.dataStore = new DataStore();
    this.wsConnections = new Map();
    this.technicalAnalysis = new TechnicalAnalysis();
    this.trader = null;
    this.reconnectAttempts = new Map();
    this.BATCH_SIZE = 200;
    this.MAX_RECONNECT_ATTEMPTS = 5;

    // 合并默认配置和用户配置
    this.config = {
      enableAutoTrading: false,
      apiKey: userConfig.apiKey || "",
      apiSecret: userConfig.apiSecret || "",
      // 使用配置文件中的默认值，可以被用户配置覆盖
      tradingParams: {
        ...config.trading,
        ...userConfig.tradingParams,
      },
      scoreWeights: {
        ...config.scoreWeights,
        ...userConfig.scoreWeights,
      },
      signalThresholds: {
        ...config.signalThresholds,
        ...userConfig.signalThresholds,
      },
    };

    // 输出当前使用的配置
    console.log("当前配置:", {
      tradingParams: this.config.tradingParams,
      scoreWeights: this.config.scoreWeights,
      signalThresholds: this.config.signalThresholds,
    });
    // 添加WebSocket相关配置
    this.WS_PONG_INTERVAL = 120000; 
    this.WS_RECONNECT_DELAY = 5000; // 基础重连延迟时间（5秒）
    this.WS_PING_INTERVAL = 30000; // 心跳间隔（30秒）
    this.WS_PONG_TIMEOUT = 10000; // 等待pong响应超时时间（10秒）
    this.wsHeartbeats = new Map(); // 存储心跳定时器
    this.wsPongTimeouts = new Map(); // 存储pong超时定时器
  }
  async initialize() {
    try {
      const symbols = await this.dataStore.getAllSymbols();
      if (symbols.length === 0) {
        console.log("没有找到交易对，请先运行历史数据获取程序");
        return;
      }

      const symbolBatches = this.splitArrayIntoBatches(
        symbols,
        this.BATCH_SIZE
      );
      console.log(
        `将分成 ${symbolBatches.length} 批处理，每批最多 ${this.BATCH_SIZE} 个交易对`
      );

      for (let i = 0; i < symbolBatches.length; i++) {
        const batchSymbols = symbolBatches[i];
        await this.connectWebSocket(batchSymbols, i);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      this.startConnectionMonitoring();
      this.isInitialized = true;
      console.log("实时监控系统初始化成功");
    } catch (error) {
      console.error("初始化失败:", error);
      throw error;
    }
  }

  splitArrayIntoBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  async connectWebSocket(symbols, wsIndex) {
    try {
      // 清理可能存在的旧连接
      if (this.wsConnections.has(wsIndex)) {
        const oldWs = this.wsConnections.get(wsIndex);
        if (oldWs.readyState === WebSocket.OPEN) {
          oldWs.close();
        }
      }

      const ws = new WebSocket("wss://fstream.binance.com/ws");
      this.wsConnections.set(wsIndex, ws);

      ws.on("open", () => {
        console.log(
          `WebSocket ${wsIndex} 连接成功，订阅 ${symbols.length} 个交易对的1小时K线`
        );

        // 重置重连计数
        this.reconnectAttempts.set(wsIndex, 0);

        // 订阅K线数据
        const subscribeMsg = {
          method: "SUBSCRIBE",
          params: symbols.map((symbol) => `${symbol.toLowerCase()}@kline_1h`),
          id: wsIndex,
        };
        ws.send(JSON.stringify(subscribeMsg));

        // 设置心跳检测
        this.setupPongInterval(ws, wsIndex);
      });

      ws.on("message", async (data) => {
        try {
          if (data.toString() === "ping") {
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.pong();
                console.log(
                  `WebSocket ${wsIndex} 响应ping帧 - ${new Date().toISOString()}`
                );
              }
            }, Math.random() * 600000); // 随机0-10分钟内回复
            return;
          }

          const message = JSON.parse(data);
          if (message.e === "kline") {
            await this.handleHourlyKline(message);
          }
        } catch (error) {
          console.error(`处理WebSocket消息失败:`, error);
        }
      });

      ws.on("error", (error) => {
        console.error(`WebSocket ${wsIndex} 错误:`, error);
        this.cleanupWebSocket(wsIndex);
        this.handleReconnect(symbols, wsIndex);
      });

      ws.on("close", () => {
        console.log(`WebSocket ${wsIndex} 连接关闭`);
        this.cleanupWebSocket(wsIndex);
        this.handleReconnect(symbols, wsIndex);
      });
    } catch (error) {
      console.error(`创建WebSocket连接失败:`, error);
      this.handleReconnect(symbols, wsIndex);
    }
  }
  setupPongInterval(ws, wsIndex) {
    // 清理可能存在的旧心跳
    this.cleanupHeartbeat(wsIndex);

    const pongInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.pong();
          console.log(
            `WebSocket ${wsIndex} 发送主动pong帧 - ${new Date().toISOString()}`
          );
        } catch (error) {
          console.error(`发送pong帧失败:`, error);
          ws.close();
        }
      }
    }, this.WS_PONG_INTERVAL);

    this.wsHeartbeats.set(wsIndex, pongInterval);
  }

  handlePong(wsIndex) {
    // 清除pong超时定时器
    const pongTimeout = this.wsPongTimeouts.get(wsIndex);
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      this.wsPongTimeouts.delete(wsIndex);
    }
  }

  cleanupHeartbeat(wsIndex) {
    // 清理心跳定时器
    const heartbeat = this.wsHeartbeats.get(wsIndex);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.wsHeartbeats.delete(wsIndex);
    }

    // 清理pong超时定时器
    const pongTimeout = this.wsPongTimeouts.get(wsIndex);
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      this.wsPongTimeouts.delete(wsIndex);
    }
  }

  cleanupWebSocket(wsIndex) {
    this.cleanupHeartbeat(wsIndex);
    this.wsConnections.delete(wsIndex);
  }

  async handleReconnect(symbols, wsIndex) {
    const attempts = this.reconnectAttempts.get(wsIndex) || 0;
    if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(wsIndex, attempts + 1);
      const delay = Math.min(
        this.WS_RECONNECT_DELAY * Math.pow(2, attempts),
        30000
      );

      console.log(
        `WebSocket ${wsIndex} 将在 ${delay / 1000} 秒后重连，尝试次数: ${
          attempts + 1
        }`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.connectWebSocket(symbols, wsIndex);
    } else {
      console.error(`WebSocket ${wsIndex} 重连失败次数过多，停止重连`);
      // 可以在这里添加告警通知
    }
  }

  async close() {
    console.log("正在关闭监控系统...");

    // 关闭所有WebSocket连接
    for (const [wsIndex, ws] of this.wsConnections.entries()) {
      try {
        this.cleanupWebSocket(wsIndex);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        console.log(`WebSocket ${wsIndex} 已关闭`);
      } catch (error) {
        console.error(`关闭 WebSocket ${wsIndex} 失败:`, error);
      }
    }

    this.wsConnections.clear();
    this.reconnectAttempts.clear();
    this.wsHeartbeats.clear();
    this.wsPongTimeouts.clear();

    if (this.trader) {
      this.disableAutoTrading();
    }

    await this.dataStore.close();
    console.log("监控系统已关闭");
  }
  async handleReconnect(symbols, wsIndex) {
    const attempts = this.reconnectAttempts.get(wsIndex) || 0;
    if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(wsIndex, attempts + 1);
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // 指数退避，最大30秒
      console.log(
        `WebSocket ${wsIndex} 将在 ${delay / 1000} 秒后重连，尝试次数: ${
          attempts + 1
        }`
      );

      setTimeout(async () => {
        await this.connectWebSocket(symbols, wsIndex);
      }, delay);
    } else {
      console.error(`WebSocket ${wsIndex} 重连失败次数过多，停止重连`);
    }
  }
  async handleHourlyKline(message) {
    try {
      const { s: symbol, k: kline } = message;

      const newKline = {
        openTime: kline.t,
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
        closeTime: kline.T,
        quoteVolume: parseFloat(kline.q),
        trades: parseInt(kline.n),
      };
      // 只处理已完成的K线
      if (kline.x) {       // 更新K线数据
        await this.dataStore.appendKlineData(symbol, "1h", [newKline]);
      }
      // 生成分析报告
      const report = await this.generateAnalysisReport(symbol, newKline);
      // if (report.scores.total > 60) {
        if (!this.lastReportTime) {
          this.lastReportTime = {};
        }
        if (!this.lastReportTime[symbol] || this.lastReportTime[symbol].signal !== report.signal) { // 15分钟内相同币种只推送一次，或者信号发生变化时推送
          this.logReport(report);
          this.lastReportTime[symbol] = { time: new Date().getTime(), signal: report.signal };
        }
      // }
      // 输出分析报告
      // this.logReport(report);

      // 如果启用了自动交易，执行交易
      if (this.config.enableAutoTrading && this.trader) {
        await this.executeTradeBasedOnReport(report);
      }
    } catch (error) {
      console.error("处理小时K线更新失败:", error);
    }
  }
  async generateAnalysisReport(symbol, currentKline) {
    try {
      const klines = await this.dataStore.loadKlineData(symbol, "1h");
      
      if (!klines || klines.length < 100) {
        return {
          symbol,
          time: new Date(currentKline.closeTime).toISOString(),
          error: "历史数据不足",
        };
      }

      // 初始化技术分析数据
      this.technicalAnalysis.initializeData(klines);

      // 计算所有指标
      const indicators = this.technicalAnalysis.calculateAllIndicators();
      // console.log('indicators',indicators)
      // 获取最新值
      const latestValues = indicators.getLatestValues();

      // 计算得分
      const scores = this.calculateScores(currentKline, indicators);

      // 生成信号
      const signal = this.generateSignal(scores);

      return {
        symbol,
        time: new Date(currentKline.closeTime).toISOString(),
        price: {
          current: currentKline.close,
          open: currentKline.open,
          high: currentKline.high,
          low: currentKline.low,
        },
        indicators: latestValues,
        scores,
        signal,
        riskLevel: this.calculateRiskLevel(scores),
        recommendation: this.generateRecommendation(signal, scores),
      };
    } catch (error) {
      console.error(`生成分析报告失败: ${symbol}`, error);
      return {
        symbol,
        time: new Date(currentKline.closeTime).toISOString(),
        error: "生成报告失败",
      };
    }
  }

  calculateScores(currentKline, indicators) {
    const scores = {
      trend: 0,
      momentum: 0,
      volatility: 0,
      volume: 0,
      support: 0,
    };

    // 趋势得分
    const ema5 = indicators.ema5[indicators.ema5.length - 1];
    const ema13 = indicators.ema13[indicators.ema13.length - 1];
    const ema144 = indicators.ema144[indicators.ema144.length - 1];
    if (ema5 > ema13 && ema13 > ema144) scores.trend = 100;
    else if (ema5 < ema13 && ema13 < ema144) scores.trend = 0;
    else if (ema5 === ema13 && ema13 === ema144) scores.trend = 50;
    else if (ema5 > ema13 && ema13 < ema144) scores.trend = 75;
    else scores.trend = 25;

    // 动量得分
    const rsi = indicators.rsi[indicators.rsi.length - 1];
    if (rsi > 70) scores.momentum = 100;
    else if (rsi < 30) scores.momentum = 0;
    else scores.momentum = 50 + (rsi - 50);

    // 波动性得分
    const bb = indicators.bollingerBands[indicators.bollingerBands.length - 1];;
    const bbWidth =
      (bb.upper - bb.lower) /
      bb.middle;

    // console.log('bbWidth',bb)
    scores.volatility = Math.min(100, bbWidth * 100);

    // 成交量得分
    const volumeMA = indicators.volumeSMA[indicators.volumeSMA.length - 1];
    scores.volume =
      currentKline.volume > volumeMA
        ? 100
        : (currentKline.volume / volumeMA) * 100;

    // 支撑/阻力得分
    const price = parseFloat(currentKline.close);
    const bbUpper = bb.upper;
    const bbLower = bb.lower;

    if (price > bbUpper) scores.support = 100;
    else if (price < bbLower) scores.support = 0;
    else scores.support = ((price - bbLower) / (bbUpper - bbLower)) * 100;

    // 计算总分
    const weights = this.config.scoreWeights;
    const totalScore = Object.keys(scores).reduce((total, key) => {
      return total + scores[key] * weights[key];
    }, 0);

    return {
      ...scores,
      total: totalScore,
    };
  }

  generateSignal(scores) {
    const { strongBuy, buy, neutral, sell } = this.config.signalThresholds;
    // console.log('strongBuy',scores.total,strongBuy, buy, neutral, sell)
    if (scores.total >= strongBuy) return "STRONG_BUY";
    if (scores.total >= buy) return "BUY";
    if (scores.total >= neutral) return "NEUTRAL";
    if (scores.total >= sell) return "SELL";
    return "STRONG_SELL";
  }

  calculateRiskLevel(scores) {
    if (scores.volatility > 80) return "HIGH";
    if (scores.volatility > 50) return "MEDIUM";
    return "LOW";
  }

  generateRecommendation(signal, scores) {
    const recommendations = {
      STRONG_BUY: {
        action: "建议做多",
        confidence: "高",
        reasons: [],
      },
      BUY: {
        action: "可以考虑做多",
        confidence: "中",
        reasons: [],
      },
      NEUTRAL: {
        action: "建议观望",
        confidence: "低",
        reasons: [],
      },
      SELL: {
        action: "可以考虑做空",
        confidence: "中",
        reasons: [],
      },
      STRONG_SELL: {
        action: "建议做空",
        confidence: "高",
        reasons: [],
      },
    };

    const rec = recommendations[signal];

    // console.log(scores)
    // 添加理由
    if (scores.trend > 70) rec.reasons.push("强势上涨趋势");
    if (scores.trend < 30) rec.reasons.push("强势下跌趋势");
    if (scores.momentum > 70) rec.reasons.push("动量强劲");
    if (scores.momentum < 30) rec.reasons.push("动量疲软");
    if (scores.volume > 70) rec.reasons.push("成交量放大");
    if (scores.volatility > 70) rec.reasons.push("波动性较大，注意风险");

    return rec;
  }

  logReport(report) {
    if (report.error) {
      console.log(`\n=== ${report.symbol} 分析报告 ===`);
      console.log("错误:", report.error);
      return;
    }

    console.log(`\n=== ${report.symbol} 分析报告 ===`);
    console.log("时间:", report.time);
    console.log("当前价格:", report.price.current);
    console.log("\n技术指标:");
    console.log("ema5:", report.indicators.ema5.toFixed(4));
    console.log("ema13:", report.indicators.ema13.toFixed(4));
    console.log("RSI:", report.indicators.rsi.toFixed(2));
    console.log("MACD:", report.indicators.macd.histogram.toFixed(2));

    console.log("\n评分:");
    console.log("趋势得分:", report.scores.trend.toFixed(2));
    console.log("动量得分:", report.scores.momentum.toFixed(2));
    console.log("波动性得分:", report.scores.volatility.toFixed(2));
    console.log("成交量得分:", report.scores.volume.toFixed(2));
    console.log("支撑/阻力得分:", report.scores.support.toFixed(2));
    console.log("总分:", report.scores.total.toFixed(2));

    console.log("\n交易信号:", report.signal);
    console.log("风险等级:", report.riskLevel);
    console.log("建议:", report.recommendation.action);
    console.log("置信度:", report.recommendation.confidence);
    console.log("原因:", report.recommendation.reasons.join(", "));

    if (this.config.enableAutoTrading) {
      console.log("\n自动交易: 已启用");
    }

    console.log("========================\n");
  }

  // 启用自动交易
  enableAutoTrading(apiKey, apiSecret) {
    if (!apiKey || !apiSecret) {
      throw new Error("启用自动交易需要提供API密钥");
    }

    this.config.enableAutoTrading = true;
    this.config.apiKey = apiKey;
    this.config.apiSecret = apiSecret;
    this.trader = new BinanceTrader(apiKey, apiSecret);
    console.log("自动交易已启用");
  }

  // 禁用自动交易
  disableAutoTrading() {
    this.config.enableAutoTrading = false;
    this.trader = null;
    console.log("自动交易已禁用");
  }

  startConnectionMonitoring() {
    setInterval(() => {
      for (const [wsIndex, ws] of this.wsConnections.entries()) {
        // console.log(`WebSocket ${wsIndex} 状态:`, {
        //   readyState: ws.readyState,
        //   reconnectAttempts: this.reconnectAttempts.get(wsIndex),
        //   timestamp: new Date().toISOString(),
        // });
      }
    }, 60000);
  }

  async executeTradeBasedOnReport(report) {
    if (!report || report.error) return;

    try {
      const signal = report.signal;
      const currentPrice = report.price.current;

      if (signal === "STRONG_BUY" || signal === "STRONG_SELL") {
        const tradeSide = signal === "STRONG_BUY" ? "LONG" : "SHORT";
        const quantity = this.calculatePositionSize(
          report.symbol,
          currentPrice
        );

        const stopLoss =
          tradeSide === "LONG"
            ? currentPrice * (1 - this.config.tradingParams.stopLoss)
            : currentPrice * (1 + this.config.tradingParams.stopLoss);

        const takeProfit =
          tradeSide === "LONG"
            ? currentPrice * (1 + this.config.tradingParams.takeProfit)
            : currentPrice * (1 - this.config.tradingParams.takeProfit);

        await this.trader.openPosition(report.symbol, tradeSide, quantity, {
          stopLoss,
          takeProfit,
          leverage: this.config.tradingParams.leverage,
        });

        console.log(`执行交易: ${report.symbol} ${tradeSide}`, {
          price: currentPrice,
          quantity,
          stopLoss,
          takeProfit,
        });
      }
    } catch (error) {
      console.error(`执行交易失败: ${report.symbol}`, error);
    }
  }

  calculatePositionSize(symbol, currentPrice) {
    return this.config.tradingParams.positionSize / currentPrice;
  }
}

module.exports = RealtimeMonitor;

const TechnicalIndicators = require('technicalindicators');

class TechnicalAnalysis {
    constructor() {
        // 初始化时不需要klines
        this.klines = null;
        this.prices = null;
        this.highs = null;
        this.lows = null;
        this.volumes = null;
    }

    // 添加初始化数据的方法
    initializeData(klines) {
        if (!klines || !Array.isArray(klines) || klines.length === 0) {
            throw new Error('无效的K线数据');
        }
        this.klines = klines;
        this.prices = klines.map(k => parseFloat(k.close));
        this.highs = klines.map(k => parseFloat(k.high));
        this.lows = klines.map(k => parseFloat(k.low));
        this.volumes = klines.map(k => parseFloat(k.volume));
    }

    // 计算单个移动平均线
    calculateMA(values, period) {
        return new TechnicalIndicators.SMA({
            values: values,
            period: period
        }).getResult();
    }

    // 计算RSI
    calculateRSI(values, period) {
        return new TechnicalIndicators.RSI({
            values: values,
            period: period
        }).getResult();
    }

    // 计算MACD
    calculateMACD(values) {
        return new TechnicalIndicators.MACD({
            values: values,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        }).getResult();
    }

    // 计算布林带
    calculateBollinger(values, period, stdDev) {
        return new TechnicalIndicators.BollingerBands({
            values: values,
            period: period,
            stdDev: stdDev
        }).getResult();
    }

    calculateAllIndicators() {
        if (!this.prices || !this.highs || !this.lows || !this.volumes) {
            throw new Error('请先使用initializeData方法初始化数据');
        }

        const indicators = {
            // EMA指标
            ema5: new TechnicalIndicators.EMA({
                values: this.prices,
                period: 5
            }).getResult(),

            ema13: new TechnicalIndicators.EMA({
                values: this.prices,
                period: 13
            }).getResult(),

            ema144: new TechnicalIndicators.EMA({
                values: this.prices,
                period: 144
            }).getResult(),

            // SMA指标
            volumeSMA: new TechnicalIndicators.SMA({
                values: this.volumes,
                period: 20
            }).getResult(),
            sma51: new TechnicalIndicators.SMA({
                values: this.prices,
                period: 51
            }).getResult(),
            sma99:  new TechnicalIndicators.SMA({
                values: this.prices,
                period: 99
            }).getResult(),
            sma144: new TechnicalIndicators.SMA({
                values: this.prices,
                period: 144
            }).getResult(),
            sma200: new TechnicalIndicators.SMA({
                values: this.prices,
                period: 200
            }).getResult(),

            // 其他指标
            rsi: new TechnicalIndicators.RSI({
                values: this.prices,
                period: 14
            }).getResult(),

            macd: new TechnicalIndicators.MACD({
                values: this.prices,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            }).getResult(),

            bollingerBands: new TechnicalIndicators.BollingerBands({
                values: this.prices,
                period: 20,
                stdDev: 2
            }).getResult(),

            atr: new TechnicalIndicators.ATR({
                high: this.highs,
                low: this.lows,
                close: this.prices,
                period: 14
            }).getResult(),

            obv: new TechnicalIndicators.OBV({
                close: this.prices,
                volume: this.volumes
            }).getResult(),

            stochastic: new TechnicalIndicators.Stochastic({
                high: this.highs,
                low: this.lows,
                close: this.prices,
                period: 14,
                signalPeriod: 3
            }).getResult(),

            ichimokuCloud: new TechnicalIndicators.IchimokuCloud({
                high: this.highs,
                low: this.lows,
                close: this.prices,
                conversionPeriod: 9,
                basePeriod: 26,
                spanPeriod: 52,
                displacement: 26
            }).getResult(),

            adx: new TechnicalIndicators.ADX({
                high: this.highs,
                low: this.lows,
                close: this.prices,
                period: 14
            }).getResult(),

            mfi: new TechnicalIndicators.MFI({
                high: this.highs,
                low: this.lows,
                close: this.prices,
                volume: this.volumes,
                period: 14
            }).getResult()
        };

        // 添加获取最新值的方法
        indicators.getLatestValues = () => {
            const lastIndex = this.prices.length - 1;
            return {
                currentPrice: this.prices[lastIndex],
                ema5: indicators.ema5[indicators.ema5.length - 1],
                ema13: indicators.ema13[indicators.ema13.length - 1],
                ema144: indicators.ema144[indicators.ema144.length - 1],
                sma51: indicators.sma51[indicators.sma51.length - 1],
                sma99: indicators.sma99[indicators.sma99.length - 1],
                sma144: indicators.sma144[indicators.sma144.length - 1],
                sma200: indicators.sma200[indicators.sma200.length - 1],
                rsi: indicators.rsi[indicators.rsi.length - 1],
                macd: indicators.macd[indicators.macd.length - 1],
                bollingerBands: indicators.bollingerBands[indicators.bollingerBands.length - 1],
                atr: indicators.atr[indicators.atr.length - 1],
                obv: indicators.obv[indicators.obv.length - 1],
                stochastic: indicators.stochastic[indicators.stochastic.length - 1],
                ichimokuCloud: indicators.ichimokuCloud[indicators.ichimokuCloud.length - 1],
                adx: indicators.adx[indicators.adx.length - 1],
                mfi: indicators.mfi[indicators.mfi.length - 1]
            };
        };

        return indicators;
    }

    findFairValueGaps() {
        if (!this.klines) {
            throw new Error('请先使用initializeData方法初始化数据');
        }

        const fvgs = [];
        for (let i = 1; i < this.klines.length - 1; i++) {
            if (this.klines[i].low > this.klines[i + 1].high) {
                fvgs.push({
                    type: 'bullish',
                    start: this.klines[i].openTime,
                    end: this.klines[i + 1].openTime,
                    price: {
                        high: this.klines[i].low,
                        low: this.klines[i + 1].high
                    },
                    size: this.klines[i].low - this.klines[i + 1].high
                });
            }
            if (this.klines[i].high < this.klines[i + 1].low) {
                fvgs.push({
                    type: 'bearish',
                    start: this.klines[i].openTime,
                    end: this.klines[i + 1].openTime,
                    price: {
                        high: this.klines[i + 1].low,
                        low: this.klines[i].high
                    },
                    size: this.klines[i + 1].low - this.klines[i].high
                });
            }
        }
        return fvgs;
    }

    generateAnalysis(klines) {
        // 如果提供了新的K线数据，则重新初始化
        if (klines) {
            this.initializeData(klines);
        }

        if (!this.klines) {
            throw new Error('没有可分析的K线数据');
        }

        const indicators = this.calculateAllIndicators();
        const latestValues = indicators.getLatestValues();
        const fvgs = this.findFairValueGaps();

        return {
            ...latestValues,
            fvgs: fvgs.slice(-5),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = TechnicalAnalysis;
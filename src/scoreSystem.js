class ScoreSystem {
    constructor() {
        this.weights = {
            trend: 0.25,
            momentum: 0.20,
            volatility: 0.15,
            volume: 0.15,
            support: 0.15,
            timeFrame: 0.10
        };

        this.criteria = {
            trend: {
                ema5_13: 10,
                ema13_144: 15,
                sma51_99: 10,
                sma144_200: 15,
                price_ema: 20
            },
            momentum: {
                rsi: 20,
                macd: 20,
                stochastic: 15,
                mfi: 15
            },
            volatility: {
                bollinger: 20,
                atr: 15,
                adx: 15
            },
            volume: {
                obv: 20,
                volume_ratio: 20
            },
            support: {
                ichimoku: 20,
                fvg: 20
            },
            timeFrame: {
                multi_timeframe: 20,
                trend_alignment: 20
            }
        };
    }

    calculateScore(analysis) {
        let totalScore = 0;
        const scores = {
            trend: 0,
            momentum: 0,
            volatility: 0,
            volume: 0,
            support: 0,
            timeFrame: 0
        };

        scores.trend = this.calculateTrendScore(analysis);
        scores.momentum = this.calculateMomentumScore(analysis);
        scores.volatility = this.calculateVolatilityScore(analysis);
        scores.volume = this.calculateVolumeScore(analysis);
        scores.support = this.calculateSupportScore(analysis);
        scores.timeFrame = this.calculateTimeFrameScore(analysis);

        for (const [category, weight] of Object.entries(this.weights)) {
            totalScore += scores[category] * weight;
        }

        return {
            totalScore,
            categoryScores: scores,
            recommendation: this.generateRecommendation(totalScore, scores)
        };
    }

    calculateTrendScore(analysis) {
        let score = 0;
        const { ema5, ema13, ema144, sma51, sma99, sma144, sma200, currentPrice } = analysis;

        if (ema5 > ema13) score += this.criteria.trend.ema5_13;
        if (ema13 > ema144) score += this.criteria.trend.ema13_144;
        if (sma51 > sma99) score += this.criteria.trend.sma51_99;
        if (sma144 > sma200) score += this.criteria.trend.sma144_200;
        
        if (currentPrice > ema5 && ema5 > ema13 && ema13 > ema144) {
            score += this.criteria.trend.price_ema;
        }

        return score;
    }

    calculateMomentumScore(analysis) {
        let score = 0;
        const { rsi, macd, stochastic, mfi } = analysis;

        if (rsi < 30) score += this.criteria.momentum.rsi;
        if (rsi > 70) score -= this.criteria.momentum.rsi;
        if (macd.histogram > 0 && macd.histogram > macd.signal) {
            score += this.criteria.momentum.macd;
        }
        if (stochastic.k < 20) score += this.criteria.momentum.stochastic;
        if (stochastic.k > 80) score -= this.criteria.momentum.stochastic;
        if (mfi < 20) score += this.criteria.momentum.mfi;
        if (mfi > 80) score -= this.criteria.momentum.mfi;

        return Math.abs(score);
    }

    calculateVolatilityScore(analysis) {
        let score = 0;
        const { bollingerBands, atr, adx, currentPrice } = analysis;

        if (currentPrice < bollingerBands.lower) score += this.criteria.volatility.bollinger;
        if (currentPrice > bollingerBands.upper) score -= this.criteria.volatility.bollinger;
        if (adx > 25) score += this.criteria.volatility.adx;

        return Math.abs(score);
    }

    calculateVolumeScore(analysis) {
        let score = 0;
        const { obv, volume_ratio } = analysis;

        if (obv.trend === 'up') score += this.criteria.volume.obv;
        if (volume_ratio > 2) score += this.criteria.volume.volume_ratio;

        return score;
    }

    calculateSupportScore(analysis) {
        let score = 0;
        const { ichimokuCloud, fvgs, currentPrice } = analysis;

        if (currentPrice > ichimokuCloud.senkouSpanA) {
            score += this.criteria.support.ichimoku;
        }

        if (fvgs.length > 0) {
            const lastFVG = fvgs[fvgs.length - 1];
            if (lastFVG.type === 'bullish' && currentPrice < lastFVG.price.high) {
                score += this.criteria.support.fvg;
            }
        }

        return score;
    }

    calculateTimeFrameScore(analysis) {
        let score = 0;
        const { multi_timeframe_signals, trend_alignment } = analysis;

        if (multi_timeframe_signals) score += this.criteria.timeFrame.multi_timeframe;
        if (trend_alignment) score += this.criteria.timeFrame.trend_alignment;

        return score;
    }

    generateRecommendation(totalScore, categoryScores) {
        let recommendation = {
            action: '',
            confidence: 0,
            riskLevel: '',
            suggestedStopLoss: 0,
            suggestedTakeProfit: 0,
            reasons: []
        };

        if (totalScore >= 80) {
            recommendation.action = '强烈买入';
            recommendation.confidence = 90;
            recommendation.riskLevel = '低';
        } else if (totalScore >= 60) {
            recommendation.action = '买入';
            recommendation.confidence = 75;
            recommendation.riskLevel = '中';
        } else if (totalScore >= 40) {
            recommendation.action = '观望';
            recommendation.confidence = 50;
            recommendation.riskLevel = '高';
        } else if (totalScore >= 20) {
            recommendation.action = '卖出';
            recommendation.confidence = 75;
            recommendation.riskLevel = '中';
        } else {
            recommendation.action = '强烈卖出';
            recommendation.confidence = 90;
            recommendation.riskLevel = '低';
        }

        for (const [category, score] of Object.entries(categoryScores)) {
            if (score > 0) {
                recommendation.reasons.push(`${category}指标显示${recommendation.action}信号`);
            }
        }

        return recommendation;
    }
}

module.exports = ScoreSystem;
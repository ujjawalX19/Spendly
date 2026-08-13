const express = require('express');
const router = express.Router();

// @route   GET /api/investments
// @desc    Get safe and researched investment ideas
// @access  Public
router.get('/', (req, res) => {
    const investments = [
        {
            id: 1,
            title: "Index Mutual Funds",
            description: "Nifty 50 or Sensex Index Funds (SIP). Consistent 12-15% CAGR over 10 years.",
            riskLevel: "Low-Moderate",
            actionText: "Start SIP",
            iconType: "PieChart",
            color: "blue"
        },
        {
            id: 2,
            title: "Bluechip Stocks",
            description: "Top 10 Indian companies (Reliance, TCS, HDFC). Huge market cap, almost zero defaulting risk.",
            riskLevel: "Moderate",
            actionText: "Explore",
            iconType: "Briefcase",
            color: "purple"
        },
        {
            id: 3,
            title: "SGBs & PPF",
            description: "Sovereign Gold Bonds (2.5% fixed + Gold hike) & PPF (7.1% tax-free). 100% Govt Backed.",
            riskLevel: "Zero Risk",
            actionText: "Invest",
            iconType: "Landmark",
            color: "yellow"
        },
        {
            id: 4,
            title: "Stablecoin Yields",
            description: "Stake USDC/USDT on verified CEX (Binance, Coinbase) for 5-8% APY. Defeats inflation without volatility.",
            riskLevel: "Low",
            actionText: "Earn Yield",
            iconType: "Bitcoin",
            color: "teal"
        }
    ];

    res.json(investments);
});

module.exports = router;

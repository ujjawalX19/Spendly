require('dotenv').config();
const { createApp } = require('./app');
const { startBurnRateChecker } = require('./jobs/burnRateChecker');

const app = createApp();
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vittova API running on port ${PORT}`);
    startBurnRateChecker();
});

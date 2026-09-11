const fs = require('fs');
const src = fs.readFileSync('src/bot-demo-data.js', 'utf8');
const m = src.match(/window\.GLD_DEMO = (\{[\s\S]*\});/);
if (!m) throw new Error('no data');
const data = JSON.parse(m[1]);
['quests_settings', 'heal_settings', 'auto_auction_settings'].forEach((k) => {
    fs.writeFileSync('_pane-' + k + '.html', data.boxes[k] || '');
    console.log(k, (data.boxes[k] || '').length);
});

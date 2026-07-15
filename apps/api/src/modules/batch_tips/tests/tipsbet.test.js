const TipsBetScraper = require("../scrapers/tipsbet.scraper");
const TipsBetNormalizer = require("../normalizers/tipsbet.normalizer");

(async () => {
    const scraper = new TipsBetScraper();
    const rawTips = await scraper.scrape();

    const normalizer = new TipsBetNormalizer();

    const tips = normalizer.normalize(rawTips);

    console.table(tips);
})();
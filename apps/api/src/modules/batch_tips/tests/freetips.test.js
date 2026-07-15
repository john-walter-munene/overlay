const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");

const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");

(async () => {
    const scraper = new FreeTipsMaxBetScraper();

    const rawTips = await scraper.scrape();

    const normalizer = new FreeTipsNormalizer();

    const tips = normalizer.normalize(rawTips);

    console.table(tips);
})();
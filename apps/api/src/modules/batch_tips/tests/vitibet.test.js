const VitiBetScraper = require("../scrapers/vitibet.scraper");
const VitiBetNormalizer = require("../normalizers/vitibet.normalizer");

(async () => {
    const scraper = new VitiBetScraper();

    const rawTips = await scraper.scrape();

    const normalizer = new VitiBetNormalizer();

    const tips = normalizer.normalize(rawTips);


    if (!tips.length) {
        throw new Error("No tips were extracted from Vitibet");
    }


    console.table(tips.map((tip) => ({
        ...tip,

        // Keep preview readable in terminal
        preview: tip.preview
            ? tip.preview.split(/\s+/).slice(0, 10).join(" ") + "..."
            : null,
    })));

})();
const TipsBetScraper = require("../scrapers/tipsbet.scraper");
const VitiBetScraper = require("../scrapers/vitibet.scraper");

const TipsBetNormalizer = require("../normalizers/tipsbet.normalizer");
const VitiBetNormalizer = require("../normalizers/vitibet.normalizer");

class FreeTipsService {

    constructor() {

        this.sources = [

            {
                scraper: new TipsBetScraper(),
                normalizer: new TipsBetNormalizer()
            },


            {
                scraper: new VitiBetScraper(),
                normalizer: new VitiBetNormalizer()
            }

        ];

    }


    async getTips() {

        const tips = [];


        for (const source of this.sources) {

            try {

                const raw =
                    await source.scraper.scrape();


                const normalized =
                    source.normalizer.normalize(raw);


                tips.push(...normalized);


            } catch(error) {

                console.error(
                    "Free source failed:",
                    error.message
                );

            }

        }


        return tips;

    }

}


module.exports = FreeTipsService;
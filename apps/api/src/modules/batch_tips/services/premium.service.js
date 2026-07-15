const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");
const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");



class PremiumTipsService {


    constructor() {

        this.source =
            new FreeTipsMaxBetScraper();


        this.normalizer =
            new FreeTipsNormalizer();

    }



    async getTips() {

        try {

            const raw = await this.source.scrape();
            return this.normalizer.normalize(raw);


        } catch(error) {

            console.error(
                "Premium source failed:",
                error.message
            );


            return [];

        }

    }


}


module.exports = PremiumTipsService;
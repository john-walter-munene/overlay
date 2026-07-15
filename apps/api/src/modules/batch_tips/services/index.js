const FreeTipsService = require("./free.service");
const PremiumTipsService = require("./premium.service");


const free = new FreeTipsService();
const premium = new PremiumTipsService();

const adminTips = {

        async getFreeTips() {
            return await free.getTips();
        },


        async getPremiumTips() {
            return await premium.getTips();
        },


        async getAllTips() {

            const freeTips =
                await free.getTips();


            const premiumTips =
                await premium.getTips();


            return {
                free: freeTips,
                premium: premiumTips,
            };
        }

    }


module.exports = { adminTips };

// Consumer only needs to take in
/*

{
    source: String,

    sport: String,

    competition: String | null,

    country: String | null,


    homeTeam: String,

    awayTeam: String,


    kickoff: String | Date | null,


    market: String,

    selection: String,


    odds: Number | null,


    preview: String | null,

    analytics: Object | null,

    confidenceIndex: Number | null,


    status: String,

    result: String | null
}
    
 */

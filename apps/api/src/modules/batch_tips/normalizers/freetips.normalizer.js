// normalizers/freetips.normalizer.js

class FreeTipsNormalizer {

    normalize(rawTips = []) {

        return rawTips.map((tip) => ({

            source: "freetips",

            externalId: null,


            sport:
                tip.sport || "Football",


            competition:
                tip.league || "Bet of the Day",


            country: null,


            homeTeam:
                tip.homeTeam || null,


            awayTeam:
                tip.awayTeam || null,


            kickoff:
                tip.time || tip.kickoff || null,


            market:
                "Player Prop",


            selection:
                tip.selection || tip.prediction || null,


            odds:
                Number(tip.odds) || null,


            previewTitle:
                tip.previewTitle || null,


            preview:
                tip.preview || null,


            analytics:
                tip.analytics || null,


            confidenceIndex:
                null,


            predictedScore:
                null,


            detailsUrl:
                tip.detailsUrl || null,


            status:
                tip.result === "?" || !tip.result
                    ? "pending"
                    : "settled",


            result:
                tip.result || null,


            scrapedAt:
                new Date(),

        }));

    }

}


module.exports = FreeTipsNormalizer;
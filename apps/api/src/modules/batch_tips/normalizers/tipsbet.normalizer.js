// normalizers/tipsbet.normalizer.js

class TipsBetNormalizer {

    normalize(rawTips = []) {

        return rawTips.map((tip) => ({

            source: "tipsbet",

            externalId: null,


            sport: this.normalizeSport(
                tip.sport,
                tip.competition
            ),


            competition:
                tip.competition || null,


            country:
                tip.country || null,


            homeTeam:
                tip.homeTeam || null,


            awayTeam:
                tip.awayTeam || null,


            kickoff:
                tip.kickoff || null,


            market:
                tip.market || null,


            selection:
                tip.market || null,


            odds:
                Number(tip.odds) || null,


            previewTitle:
                null,


            preview:
                null,


            analytics:
                null,


            confidenceIndex:
                null,


            predictedScore:
                null,


            detailsUrl:
                null,


            status:
                tip.result === "?" || !tip.result
                    ? "pending"
                    : this.getStatus(tip.result),


            result:
                tip.result || null,


            scrapedAt:
                new Date(),

        }));
    }



    normalizeSport(sport, competition) {

        const text =
            `${sport || ""} ${competition || ""}`
                .toLowerCase();



        if (
            text.includes("nba") ||
            text.includes("basketball")
        ) {
            return "Basketball";
        }



        if (
            text.includes("atp") ||
            text.includes("wta") ||
            text.includes("tennis")
        ) {
            return "Tennis";
        }



        if (
            text.includes("football") ||
            text.includes("soccer") ||
            text.includes("world cup") ||
            text.includes("champions league") ||
            text.includes("conference league") ||
            text.includes("club friendly") ||
            text.includes("premier league") ||
            text.includes("league") ||
            text.includes("cup")
        ) {
            return "Football";
        }



        return sport || "Unknown";
    }



    getStatus(result) {

        if (!result || result === "?") {
            return "pending";
        }


        return "settled";
    }

}


module.exports = TipsBetNormalizer;
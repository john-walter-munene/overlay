// normalizers/vitibet.normalizer.js

class VitiBetNormalizer {
    normalize(rawTips) {
        return rawTips.map((tip) => {
            const { country, competition } = this.parseLeague(tip.league);

            return {
                source: "vitibet",

                externalId: tip.fixtureId || null,

                sport: this.normalizeSport(
                    tip.sport,
                    competition
                ),

                competition,

                country,

                homeTeam: tip.homeTeam,

                awayTeam: tip.awayTeam,

                kickoff: tip.time || null,

                market: "Match Winner",

                selection: this.selection(
                    tip.prediction
                ),

                odds: null,

                detailsUrl: tip.detailsUrl || null,
                previewTitle: tip.previewTitle || null,
                analytics: tip.analytics || null,
                fixtureId: tip.fixtureId || null,

                // Vitibet extra context
                confidenceIndex: tip.index
                    ? Number(tip.index)
                    : null,

                predictedScore: tip.score || null,

                preview: this.cleanPreview(
                    tip.preview
                ),
                context: this.buildContext(tip.preview),

                status: this.determineStatus(tip.result),

                result: tip.result || "?",

                scrapedAt: new Date(),
            };
        });
    }


    normalizeSport(sport, competition) {
        const text =
            `${sport} ${competition}`.toLowerCase();


        if (
            text.includes("football") ||
            text.includes("soccer") ||
            text.includes("league") ||
            text.includes("cup")
        ) {
            return "Football";
        }


        if (text.includes("basket")) {
            return "Basketball";
        }


        if (text.includes("hockey")) {
            return "Hockey";
        }


        if (text.includes("handball")) {
            return "Handball";
        }


        return sport || "Unknown";
    }



    parseLeague(league) {
        if (!league) {
            return {
                country: null,
                competition: null,
            };
        }


        const parts = league
            .split("-")
            .map((item) => item.trim());


        if (parts.length >= 2) {
            return {
                country: parts[0],
                competition: parts.slice(1).join(" "),
            };
        }


        return {
            country: null,
            competition: league,
        };
    }



    selection(prediction) {
        switch(prediction) {

            case "1":
                return "Home";

            case "2":
                return "Away";

            case "X":
            case "0":
            case "Draw":
                return "Draw";

            default:
                return prediction || "Unknown";
        }
    }



    determineStatus(result) {
        if (!result || result === "?" || String(result).trim() === "") {
            return "pending";
        }

        return "settled";
    }

    buildContext(text) {
        if (!text) return null;

        const words = String(text)
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!words.length) return null;

        return words.slice(0, 5).join(" ");
    }

    cleanPreview(preview) {
        if (!preview) return null;


        return preview
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
    }
}

module.exports = VitiBetNormalizer;
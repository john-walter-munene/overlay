const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

class VitiBetScraper {
    constructor() {
        this.url =
            "https://www.vitibet.com/index.php?clanek=tipoftheday&sekce=fotbal&lang=en";
        this.baseUrl = "https://www.vitibet.com/";
        this.headers = {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        };
    }

    resolveUrl(href) {
        if (!href) return null;
        try {
            return new URL(href, this.baseUrl).toString();
        } catch {
            return href;
        }
    }

    async fetchDetailPage(url) {
        if (!url) {
            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: null,
                fixtureId: null,
            };
        }

        try {
            const response = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(response.data);
            const title = this.extractTitle($);
            const preview = this.extractPreview($);
            const analytics = this.extractAnalytics($);

            return {
                previewTitle: title,
                preview,
                analytics,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        } catch (error) {
            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        }
    }

    extractFixtureId(url) {
        try {
            const parsed = new URL(url);
            return parsed.searchParams.get("fixture_id") || null;
        } catch {
            return null;
        }
    }

    extractTitle($) {
        const candidates = [
            "h1",
            "h2",
            "h3",
            ".match-title",
            ".viti-v6-main-title",
            "#match-title",
        ];

        for (const selector of candidates) {
            const text = $(selector).first().text().trim();
            if (text) return text;
        }

        return null;
    }

    extractPreview($) {
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const marker = "Match Preview";
        const markerIndex = bodyText.indexOf(marker);

        if (markerIndex !== -1) {
            const previewChunk = bodyText.slice(markerIndex + marker.length).trim();
            return previewChunk.slice(0, 1500);
        }

        return null;
    }

    extractAnalytics($) {
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const marker = "Vitibet Analytics";
        const markerIndex = bodyText.indexOf(marker);

        if (markerIndex !== -1) {
            const analyticsChunk = bodyText.slice(markerIndex + marker.length).trim();
            return analyticsChunk.slice(0, 1000);
        }

        return null;
    }

    async scrape() {
        try {
            console.log("Fetching Vitibet...");

            const response = await axios.get(this.url, {
                headers: this.headers,
            });

            const { data } = response;
            fs.writeFileSync("vitibet.html", data);

            const $ = cheerio.load(data);
            const root = $("#tipoftheday");

            if (!root.length) {
                throw new Error("Unable to find #tipoftheday on the Vitibet page");
            }

            const results = [];
            const sections = root.find(".viti-v6-sport-section").toArray();

            for (const section of sections) {
                const sport = $(section)
                    .find(".viti-v6-sport-title")
                    .first()
                    .text()
                    .trim();

                const items = $(section).find(".viti-v6-item-wrap").toArray();

                for (const item of items) {
                    const league = $(item)
                        .find(".viti-v6-match-league")
                        .first()
                        .text()
                        .trim();

                    const card = $(item).find("a.viti-v6-card").first();
                    if (!card.length) continue;

                    const href = card.attr("href") || "";
                    const url = this.resolveUrl(href);
                    const teams = card.find(".viti-v6-team-side");
                    const homeTeam = teams.first().find(".viti-v6-team-name").text().trim();
                    const awayTeam = teams.last().find(".viti-v6-team-name").text().trim();
                    const time = card.find(".viti-v6-m-time").text().trim();
                    const score = card.find(".viti-v6-m-score").text().trim();
                    const prediction = card.find(".viti-v6-badge").text().trim();
                    const indexText = card
                        .find(".viti-v6-m-index")
                        .text()
                        .replace(/INDEX:\s*/i, "")
                        .trim();

                    const detail = await this.fetchDetailPage(url);

                    results.push({
                        sport: sport || null,
                        league: league || null,
                        homeTeam: homeTeam || null,
                        awayTeam: awayTeam || null,
                        time: time || null,
                        score: score || null,
                        prediction: prediction || null,
                        index: indexText || null,
                        url: url || null,
                        ...detail,
                    });
                }
            }

            console.log(`Extracted ${results.length} tips from Vitibet.`);
            return results;
        } catch (err) {
            console.error("SCRAPER ERROR:", err);
            return [];
        }
    }
}

module.exports = VitiBetScraper;

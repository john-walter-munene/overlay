// scrapers/freetips.scraper.js

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

// This scraper is currently running on a manually saved file
// A production web scraper will be need to replace the page so that we download it first
// This site has cloudflare blocks
class FreeTipsMaxBetScraper {
    constructor() {
        this.url = "https://www.freetips.com/betting/bet-of-the-day/";
        this.baseUrl = "https://www.freetips.com";

        // Set to false when you want to fetch from the website again.
        this.useLocalHtml = true;

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

    async scrape() {
        try {
            let html;

            if (this.useLocalHtml) {
                console.log("Loading local freetips.html...");
                html = fs.readFileSync("freetips.html", "utf8");
            } else {
                console.log("Fetching FreeTips Bet of the Day...");

                const response = await axios.get(this.url, {
                    headers: this.headers,
                });

                html = response.data;

                fs.writeFileSync("freetips.html", html);
            }

            const $ = cheerio.load(html);

            const tip = this.extractMainTip($);

            console.log("Extracted 1 Bet of the Day.");

            return [tip];
        } catch (err) {
            console.error("SCRAPER ERROR:", err.message);
            return [];
        }
    }

    extractMainTip($) {
        const body = $("body")
            .text()
            .replace(/\s+/g, " ")
            .trim();

        const kickoff =
            body.match(/Bet of the Day\s+(\d{1,2}:\d{2})/)?.[1] ??
            null;

        const reason =
            body.match(
                /Reason for tip\s*(.*?)\s*(?:See full preview|Choose Your Stake)/i
            )?.[1]
                ?.trim() ?? null;

        const previewHref = $("a")
            .filter((_, el) =>
                $(el).text().trim() === "See full preview"
            )
            .attr("href");

        const detailsUrl = this.resolveUrl(previewHref);

        const fixture =
            body.match(
                /(\d{1,2}:\d{2})\s+(.*?)\s+([A-Za-z .'-]+?)\s+v\s+([A-Za-z .'-]+?)\s+(.*?)\s+(\d+\.\d+)/
            );

        if (!fixture) {
            return {
                sport: "Football",
                league: "Bet of the Day",

                homeTeam: null,
                awayTeam: null,

                time: kickoff,
                score: null,

                prediction: null,
                index: null,

                url: detailsUrl,

                previewTitle: "Bet of the Day",
                preview: reason,
                analytics: null,

                detailsUrl,
                fixtureId: null,

                extraTips: [],
            };
        }

        return {
            sport: "Football",

            league: "Bet of the Day",

            homeTeam: fixture[3].trim(),
            awayTeam: fixture[4].trim(),

            time: fixture[1],

            score: null,

            prediction: fixture[5].trim(),

            odds: Number(fixture[6]),

            index: null,

            url: detailsUrl,

            previewTitle: "Bet of the Day",

            preview: reason,

            analytics: null,

            detailsUrl,

            fixtureId: null,

            extraTips: [],
        };
    }
}

module.exports = FreeTipsMaxBetScraper;
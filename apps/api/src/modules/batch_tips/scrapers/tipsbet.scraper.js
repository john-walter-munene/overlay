const axios = require("axios");
const cheerio = require("cheerio");

class TipsBetScraper {
  constructor() {
    this.url = "https://tipsbet.co.uk/";
  }

  async scrape() {
    try {
      console.log("Fetching TipsBet...");

      const { data } = await axios.get(this.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        },
      });

      const $ = cheerio.load(data);

      // Today's heading
      const today = new Date();
      const todayString =
        String(today.getDate()).padStart(2, "0") +
        "." +
        String(today.getMonth() + 1).padStart(2, "0") +
        "." +
        today.getFullYear();

      let todayTable = null;

      // Find:
      // Free Betting Tips – 15.07.2026
      $("h1,h2,h3,h4,h5,strong").each((_, el) => {
        const text = $(el).text().trim();

        if (
          text.includes("Free Betting Tips") &&
          text.includes(todayString)
        ) {
          todayTable = $(el).nextAll("table").first();
          return false;
        }
      });

      // Fallback
      if (!todayTable || todayTable.length === 0) {
        console.log("Couldn't locate today's heading.");
        console.log("Using first betting table instead.");

        $("table").each((_, table) => {
          const firstRow = $(table).find("tr").eq(1).text();

          if (
            firstRow.includes("World") ||
            firstRow.includes("Club Friendly") ||
            firstRow.includes("NBA") ||
            firstRow.includes("M-ATP")
          ) {
            todayTable = $(table);
            return false;
          }
        });
      }

      if (!todayTable || todayTable.length === 0) {
        console.log("No betting table found.");
        return [];
      }

      console.log(
        `Found table with ${todayTable.find("tr").length} rows.`
      );

      const tips = [];

      todayTable.find("tr").each((i, row) => {
        if (i === 0) return; // Skip header

        const cells = $(row).find("td");

        if (cells.length < 9) return;

        const kickoff = $(cells[0]).text().trim();
        const country = $(cells[2]).text().trim();
        const sport = $(cells[3]).text().trim();
        const competition = $(cells[4]).text().trim();
        const teams = $(cells[5]).text().trim();
        const tip = $(cells[6]).text().trim();
        const odds = parseFloat($(cells[7]).text().trim());
        const result = $(cells[8]).text().trim();

        const [homeTeam = "", awayTeam = ""] = teams
          .split("–")
          .map((t) => t.trim());

        tips.push({
          kickoff,
          country,
          sport,
          competition,
          homeTeam,
          awayTeam,
          market: tip,
          odds,
          result,
        });
      });

      console.log(`Extracted ${tips.length} tips.`);

      return tips;
    } catch (err) {
      console.error(err.message);
      return [];
    }
  }
}

module.exports = TipsBetScraper;
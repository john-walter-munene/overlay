const { adminTips } = require("../services/index");


(async()=> {

    console.log("==========================");
    console.log(" TIPS CONTRACT TEST ");
    console.log("==========================");


    const freeTips =
        await adminTips.getFreeTips();


    const premiumTips =
        await adminTips.getPremiumTips();



    const allTips = [
        ...freeTips,
        ...premiumTips,
    ];



    console.log(
        `Free tips: ${freeTips.length}`
    );


    console.log(
        `Premium tips: ${premiumTips.length}`
    );



    // Basic service checks

    if (!Array.isArray(freeTips)) {
        throw new Error(
            "Free service must return an array"
        );
    }


    if (!Array.isArray(premiumTips)) {
        throw new Error(
            "Premium service must return an array"
        );
    }


    if (allTips.length === 0) {
        throw new Error(
            "No tips returned from services"
        );
    }



    console.log("\nSample:");

    console.table(
        allTips.slice(0, 5)
    );



    console.log("\nChecking contract...\n");



    let invalidCount = 0;



    for (const tip of allTips) {


        const missing = [];



        if (!tip.sport) {
            missing.push("sport");
        }


        if (!tip.homeTeam) {
            missing.push("homeTeam");
        }


        if (!tip.awayTeam) {
            missing.push("awayTeam");
        }



        if (!tip.market && !tip.prediction) {
            missing.push("market/prediction");
        }



        if (missing.length > 0) {

            invalidCount++;


            console.log(
                "⚠️ Invalid tip found"
            );


            console.log(
                "Source:",
                tip.source || "unknown"
            );


            console.log(
                "Missing:",
                missing
            );


            console.dir(
                tip,
                {
                    depth: null
                }
            );


            console.log(
                "--------------------------------"
            );

        }

    }



    if (invalidCount > 0) {

        console.log(
            `\n⚠️ Found ${invalidCount} tips needing normalization`
        );

    } else {

        console.log(
            "\n✅ All tips satisfy current contract"
        );

    }



})();
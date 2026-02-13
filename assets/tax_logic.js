// tax_logic.js - Shared Tax Calculation Logic
// Designed to be used in both Browser (global scope) and Node.js (module.exports)

(function (exports) {

    // --- Core Calculation Functions ---

    // 1. Calculate Relief Benefits (Anchor, Freeze, StayNJ)
    function calculateRelief(age, income, years, baseTax, isHomeowner, currentTax, rules) {
        let r = { anchor: 0, freeze: 0, staynj: 0, total: 0 };

        // If income is not provided (null), assume no eligibility for means-tested benefits
        if (income === null || income === undefined || isNaN(income)) {
            return r;
        }

        // A. Senior Freeze
        if (age >= rules.Senior_Freeze.age_min && years >= rules.Senior_Freeze.years_in_home_min && income <= rules.Senior_Freeze.income_limit_2025) {
            if (baseTax > 0 && currentTax > baseTax) {
                r.freeze = currentTax - baseTax;
            }
        }

        // B. Anchor
        const ruleAnchor = rules.ANCHOR;
        if (isHomeowner) {
            if (income <= ruleAnchor.homeowner.tier1.limit) r.anchor += ruleAnchor.homeowner.tier1.base;
            else if (income <= ruleAnchor.homeowner.tier2.limit) r.anchor += ruleAnchor.homeowner.tier2.base;

            if (age >= ruleAnchor.homeowner.bonus_age && r.anchor > 0) r.anchor += ruleAnchor.homeowner.bonus_amount;
        } else {
            if (income <= ruleAnchor.renter.tier1.limit) r.anchor += ruleAnchor.renter.tier1.base;
            if (age >= ruleAnchor.renter.bonus_age && r.anchor > 0) r.anchor += ruleAnchor.renter.bonus_amount;
        }

        // C. Stay NJ
        const ruleStay = rules.Stay_NJ;
        if (isHomeowner && age >= ruleStay.age_min && income < ruleStay.income_limit) {
            const target = Math.min(currentTax * ruleStay.benefit_percent, ruleStay.benefit_cap);
            const existing = r.freeze + r.anchor;

            // StayNJ pays the difference to reach the target (50% benefit)
            // But total benefit (Anchor + Freeze + StayNJ) capped at ruleStay.total_relief_cap (6500)

            // Let's calculate raw potential StayNJ first
            let potentialStay = 0;
            if (target > existing) {
                potentialStay = target - existing;
            }

            // Apply Global Cap (Anchor + StayNJ <= 6500)
            const combinedAnchorStay = r.anchor + potentialStay;
            if (combinedAnchorStay > ruleStay.total_relief_cap) {
                // Reduce StayNJ to fit cap
                const maxStay = Math.max(0, ruleStay.total_relief_cap - r.anchor);
                r.staynj = Math.min(potentialStay, maxStay);
            } else {
                r.staynj = potentialStay;
            }
        }

        r.total = r.anchor + r.freeze + r.staynj;
        return r;
    }

    // Export functions
    exports.calculateRelief = calculateRelief;

})(typeof exports === 'undefined' ? (this.TaxLogic = {}) : exports);

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
        if (isHomeowner && age >= rules.Senior_Freeze.age_min && years >= rules.Senior_Freeze.years_in_home_min && income <= rules.Senior_Freeze.income_limit_2025) {
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
        // Formula: StayNJ fills the gap to reach 50% of Property Tax (capped at $6,500)
        // taking into account existing Anchor and Freeze benefits.
        const ruleStay = rules.Stay_NJ;
        if (isHomeowner && age >= ruleStay.age_min && years >= ruleStay.years_in_home_min && income < ruleStay.income_limit) {
            const halfTax = currentTax * ruleStay.benefit_percent;
            const cap = ruleStay.benefit_cap;

            // Target Relief is 50% of tax, but not more than $6,500
            const targetRelief = Math.min(halfTax, cap);

            // Benefits already received
            const existingRelief = r.anchor + r.freeze;

            // StayNJ pays the difference
            if (targetRelief > existingRelief) {
                r.staynj = targetRelief - existingRelief;
            } else {
                r.staynj = 0;
            }
        }

        r.total = r.anchor + r.freeze + r.staynj;

        // Global Cap: Total benefits cannot exceed the property tax amount
        if (r.total > currentTax) {
            // Logic on which to reduce? 
            // "Amounts that you receive under the Senior Freeze program are in addition... total cannot be more than property taxes"
            // Usually they reduce the benefits in some order, but simpler to just cap the total if it exceeds?
            // Since StayNJ is calculated last as a gap filler, likely it wouldn't cause overflow unless Anchor+Freeze > Tax.
            // Anchor + Freeze > Tax is possible if tax is very low.
            // Docs say: "The total amount of all property tax relief benefits you receive cannot be more than the property taxes paid"
            // We will clamp total to currentTax.
            r.total = Math.min(r.total, currentTax);
        }

        r.total = r.anchor + r.freeze + r.staynj;
        return r;
    }

    // Export functions
    exports.calculateRelief = calculateRelief;

})(typeof exports === 'undefined' ? (this.RebateLogic = {}) : exports);

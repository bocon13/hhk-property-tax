// tax_logic.js - Shared Tax Calculation Logic
// Designed to be used in both Browser (global scope) and Node.js (module.exports)

(function (exports) {

    // --- Core Calculation Functions ---

    // 1. Calculate Standard Deduction
    function getStandardDeduction(year, status, age65, rules) {
        const ruleYear = rules.standard_deductions[year] || rules.standard_deductions["2026_est"];
        let ded = ruleYear[status] || ruleYear.single;

        if (age65) {
            const bonusType = status.startsWith('married') ? 'married' : 'single';
            ded += ruleYear.blind_aged_bonus[bonusType];
        }
        return ded;
    }

    // 2. Calculate SALT Deduction Limit
    function calculateSaltLimit(income, rule) {
        if (typeof rule === 'number') return rule;
        if (!income) return rule.base_limit;

        if (income <= rule.phase_out_start) return rule.base_limit;
        if (income >= rule.phase_out_end) return rule.min_limit;

        const excess = income - rule.phase_out_start;
        const steps = Math.floor(excess / rule.phase_out_step);
        const reduction = steps * rule.reduction_per_step;

        return Math.max(rule.base_limit - reduction, rule.min_limit);
    }

    // 3. Estimate NJ Income Tax
    function estimateNJIncomeTax(income, brackets) {
        if (!brackets) return income * 0.05;
        let tax = 0;
        let prev = 0;
        for (let b of brackets) {
            if (income > b.limit) {
                tax += (b.limit - prev) * b.rate;
                prev = b.limit;
            } else {
                tax += (income - prev) * b.rate;
                return tax;
            }
        }
        return tax;
    }

    // 4. Get Federal Marginal Tax Rate
    function getMarginalTaxRate(income, brackets) {
        if (!brackets) return { rate: 0.24, label: "24%" };
        for (let b of brackets) {
            if (income <= b.limit) return b;
        }
        return brackets[brackets.length - 1]; // Fallback to highest
    }

    // 5. Calculate Relief Benefits (Anchor, Freeze, StayNJ)
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
            // Note: Freeze is technically separate but StayNJ interacts with it. 
            // The law says "Total relief estimated... capped at 6500". 
            // Actually, Freeze is separate. Usually StayNJ + Anchor is capped?
            // "The ANCHOR benefit and StayNJ benefit combined cannot exceed $6,500."
            // Freeze is separate reimbursement.

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

    // 6. Calculate Net Cost (The Big Function)
    function calcNetCost(yearLabel, propTax, reliefObj, rulesKey, inputs, taxRules) {
        const { income, filingStatus, age65, userMortgage, userCharity, rulesKeySalt } = inputs;

        // 1. Determine SALT Cap
        const saltCap = calculateSaltLimit(income, taxRules.salt_caps[rulesKeySalt || rulesKey]); // Use specific salt key if provided (e.g. 2026)

        // 2. Determine SALT Deduction (limited by cap)
        // Reduced Itemized Deduction: StayNJ benefit reduces deductible property tax
        const reliefTotal = reliefObj ? reliefObj.total : 0;
        const deductiblePropTax = Math.max(0, propTax - reliefTotal);

        // Estimate NJ Tax for SALT
        const estNJIncomeTax = (income > 0) ? estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates) : 0;

        // SALT = Deductible Property Tax + NJ Income Tax
        const totalSALT = deductiblePropTax + estNJIncomeTax;
        const allowedSALT = Math.min(totalSALT, saltCap);

        // 3. Total Itemized
        const itemizedDed = userMortgage + userCharity + allowedSALT;

        // 4. Standard Deduction
        const stdDed = getStandardDeduction(rulesKey, filingStatus, age65, taxRules);

        // 5. Effective Deduction
        const effectiveDed = Math.max(itemizedDed, stdDed);
        const isItemizing = itemizedDed > stdDed;

        // 6. Federal Tax Benefit
        // Calculate Taxable Income with and without Property Tax
        const taxIncA = Math.max(0, income - effectiveDed);

        const saltB = Math.min(estNJIncomeTax, saltCap);
        const itemizedB = userMortgage + userCharity + saltB;
        const effectiveDedB = Math.max(itemizedB, stdDed);
        const taxIncB = Math.max(0, income - effectiveDedB);

        const deductableDiff = taxIncB - taxIncA; // Positive number

        // Get Fed Bracket
        const brackets = taxRules.federal_brackets_2025[filingStatus] || taxRules.federal_brackets_2025.single; // Using 2025 brackets for rate estimate
        // We really should use the provided 'fedBracket' rate if available, or look it up.
        // Let's look it up based on Taxable Income A.
        const fedBracketObj = getMarginalTaxRate(taxIncA, brackets);
        const fedBracket = fedBracketObj.rate;

        const fedBenefit = deductableDiff * fedBracket;

        return {
            netCost: propTax - reliefTotal - fedBenefit,
            fedBenefit: fedBenefit,
            deductionUsed: effectiveDed,
            stdDed: stdDed,
            saltDed: allowedSALT,
            otherDed: userMortgage + userCharity,
            totalItemized: itemizedDed,
            isItemizing: isItemizing,
            labelDed: isItemizing ? "Itemized" : "Standard",
            isSaltCapped: totalSALT > saltCap,
            estNJIncomeTax: estNJIncomeTax
        };
    }

    // Export functions
    exports.getStandardDeduction = getStandardDeduction;
    exports.calculateSaltLimit = calculateSaltLimit;
    exports.estimateNJIncomeTax = estimateNJIncomeTax;
    exports.getMarginalTaxRate = getMarginalTaxRate;
    exports.calculateRelief = calculateRelief;
    exports.calcNetCost = calcNetCost;

})(typeof exports === 'undefined' ? (this.TaxLogic = {}) : exports);

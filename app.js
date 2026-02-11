document.addEventListener('DOMContentLoaded', () => {
    let properties = [];
    const searchInput = document.getElementById('addressInput');
    const suggestionsBox = document.getElementById('suggestions');
    const resultsSection = document.getElementById('results');
    const budgetInput = document.getElementById('budgetRate');
    const voteToggle = document.getElementById('voteToggle');

    // Constants
    const TAX_RATE_2025 = 0.02501; // 2.501%
    const TAX_RATE_2026_EST = 0.01436; // 1.436%

    // Helper to format currency
    const formatCurrency = (num) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(num);
    };

    // Helper to format percentage
    const formatPercent = (num) => {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }).format(num);
    };

    // Load Data
    fetch('assets/assessment_data.json?v=' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            properties = data;
            // Simple sort by address
            properties.sort((a, b) => a.address.localeCompare(b.address));
        })
        .catch(err => console.error('Error loading data:', err));

    // Search Logic
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        suggestionsBox.innerHTML = '';

        if (query.length < 2) {
            suggestionsBox.style.display = 'none';
            return;
        }

        const matches = properties
            .filter(p => p.address.toLowerCase().includes(query))
            .sort((a, b) => {
                const aStarts = a.address.toLowerCase().startsWith(query);
                const bStarts = b.address.toLowerCase().startsWith(query);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return a.address.localeCompare(b.address);
            })
            .slice(0, 10);

        if (matches.length > 0) {
            suggestionsBox.style.display = 'block';
            matches.forEach(prop => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = prop.address;
                div.addEventListener('click', () => selectProperty(prop));
                suggestionsBox.appendChild(div);
            });
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    // Autofill / Exact Match Logic
    searchInput.addEventListener('change', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const match = properties.find(p => p.address.toLowerCase() === query);
        if (match) {
            selectProperty(match);
            searchInput.blur(); // Hide keyboard on mobile
            suggestionsBox.style.display = 'none';
        }
    });

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });

    // Select Property
    function selectProperty(prop) {
        searchInput.value = prop.address;
        suggestionsBox.style.display = 'none';

        // Track Search Event
        if (typeof gtag === 'function') {
            gtag('event', 'address_search');
        }

        document.getElementById('results').classList.remove('hidden'); // Show main results
        renderResults(prop);
    }

    // Render Results
    function renderResults(prop) {
        // Validation check for numeric values
        const val2025 = parseFloat(prop.assessment_2025) || 0;
        const val2026 = parseFloat(prop.assessment_2026) || 0;

        // Update 2025/2026 Comparison Table
        document.getElementById('lblAssmt25').textContent = formatCurrency(val2025);
        document.getElementById('lblTax25').textContent = formatCurrency(val2025 * TAX_RATE_2025);

        document.getElementById('lblAssmt26').textContent = formatCurrency(val2026);
        document.getElementById('lblTax26No').textContent = formatCurrency(val2026 * TAX_RATE_2026_EST);

        const tax26Yes = val2026 * TAX_RATE_2026_YES;
        document.getElementById('lblAssmt26Yes').textContent = formatCurrency(val2026);
        document.getElementById('lblTax26Yes').textContent = formatCurrency(tax26Yes);

        const voteCost = tax26Yes - (val2026 * TAX_RATE_2026_EST);
        document.getElementById('lblVoteCost').textContent = formatCurrency(voteCost);

        // Store current property
        window.currentProperty = prop;

        // Prefill Base Year Tax with 2025 Tax (Default for new applicants)
        const tax25 = val2025 * TAX_RATE_2025;
        document.getElementById('inputBaseTax').value = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(tax25);

        // Initial Calculation with defaults
        calculateScenario();
    }

    // --- SCENARIO CALCULATION
    // UI Elements
    const selFilingStatus = document.getElementById('selFilingStatus');
    const inputAge = document.getElementById('chkAge65'); // Checkbox
    const selIncome = document.getElementById('selIncome'); // Select Dropdown
    const manualIncome = document.getElementById('manualIncome'); // Manual Input

    // const inputFedBracket = document.getElementById('inputFedBracket'); // Removed Select
    const displayFedBracket = document.getElementById('displayFedBracket'); // Read-only Display

    const inputNJRate = document.getElementById('inputNJRate'); // Hidden Input
    const inputYears = document.getElementById('chkYearsBase'); // Checkbox
    const inputBaseTax = document.getElementById('inputBaseTax');
    const radioStatus = document.querySelectorAll('input[name="status"]');

    // New Deduction Inputs
    const inputMortgage = document.getElementById('inputMortgage');
    const inputCharity = document.getElementById('inputCharity');

    // Tax Rates
    // TAX_RATE_2025 = 0.02501 defined at top
    // TAX_RATE_2026_EST = 0.01436 defined at top
    const TAX_RATE_2026_YES = 0.01580; // Estimated with School Budget (1.436 + 0.144)

    // Event Listeners for Live Update
    inputAge.addEventListener('change', calculateScenario);
    selFilingStatus.addEventListener('change', () => {
        updateBracketFromIncome();
        calculateScenario();
    });

    // Formatting for Mortgage/Charity
    [inputMortgage, inputCharity].forEach(input => {
        input.addEventListener('input', () => {
            calculateScenario();
        });
        input.addEventListener('blur', (e) => {
            const val = parseFloat(e.target.value.replace(/,/g, ''));
            if (!isNaN(val)) {
                e.target.value = new Intl.NumberFormat('en-US').format(val);
            } else {
                e.target.value = "";
            }
            calculateScenario();
        });
    });

    // Sync Dropdown to Manual Input (Formatted)
    selIncome.addEventListener('change', () => {
        if (selIncome.value) {
            manualIncome.value = new Intl.NumberFormat('en-US').format(selIncome.value);
        } else {
            manualIncome.value = "";
        }
        updateBracketFromIncome();
        calculateScenario();
    });

    // Manual Input drives calculation & updates Dropdown
    manualIncome.addEventListener('input', () => {
        const val = parseFloat(manualIncome.value.replace(/,/g, ''));
        if (!isNaN(val)) {
            // Sync Dropdown (ranges based on tax program tiers)
            if (val <= 150000) selIncome.value = "75000";
            else if (val <= 172475) selIncome.value = "160000";
            else if (val <= 250000) selIncome.value = "200000";
            else if (val <= 500000) selIncome.value = "350000";
            else selIncome.value = "600000";
        } else {
            selIncome.value = "";
        }

        // Allow user to type, calculation handles stripped commas
        updateBracketFromIncome();
        calculateScenario();
    });

    // Format on blur
    manualIncome.addEventListener('blur', (e) => {
        const raw = e.target.value.replace(/,/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
            e.target.value = new Intl.NumberFormat('en-US').format(val);
        }
        updateBracketFromIncome(); // Re-run to be safe
        calculateScenario();
    });

    inputYears.addEventListener('change', calculateScenario);
    radioStatus.forEach(r => r.addEventListener('change', calculateScenario));


    // Base Tax Formatting & Live Update
    inputBaseTax.addEventListener('change', calculateScenario);

    inputBaseTax.addEventListener('focus', (e) => {
        const val = e.target.value.replace(/,/g, '');
        e.target.value = val;
    });

    inputBaseTax.addEventListener('blur', (e) => {
        const val = parseFloat(e.target.value.replace(/,/g, ''));
        if (!isNaN(val)) {
            e.target.value = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(val);
        }
        calculateScenario();
    });

    // Helper: Get Standard Deduction
    function getStandardDeduction(year, status, age65, rules) {
        // Handle year mismatch or missing config gracefully
        const ruleYear = rules.standard_deductions[year] || rules.standard_deductions["2026_est"];
        let ded = ruleYear[status] || ruleYear.single;

        // Age Bonus
        if (age65) {
            // Simplification: If status is 'married*', use 'married' bonus, else 'single' bonus
            const bonusType = status.startsWith('married') ? 'married' : 'single';
            ded += ruleYear.blind_aged_bonus[bonusType];
        }
        return ded;
    }

    // Helper: Calculate SALT Deduction Limit with Phase-out
    function calculateSaltLimit(income, rule) {
        if (typeof rule === 'number') return rule;

        // If we have no income data, assume full deduction (optimistic) or base?
        // If income is null/0, return base_limit.
        if (!income) return rule.base_limit;

        if (income <= rule.phase_out_start) {
            return rule.base_limit;
        }
        if (income >= rule.phase_out_end) {
            return rule.min_limit;
        }

        const excess = income - rule.phase_out_start;
        // "For every $10,000 over": implies integer division
        const steps = Math.floor(excess / rule.phase_out_step);
        const reduction = steps * rule.reduction_per_step;

        return Math.max(rule.base_limit - reduction, rule.min_limit);
    }

    function updateBracketFromIncome() {
        if (!taxRules) return;
        const incomeVal = manualIncome.value.replace(/,/g, ''); // Strip commas
        if (incomeVal === "") {
            displayFedBracket.value = "";
            displayFedBracket.dataset.rate = "";
            inputNJRate.value = "";
            return;
        }

        const income = parseFloat(incomeVal);
        const status = selFilingStatus.value;

        // Get Standard Deduction for display purposes (2025)
        // Just to calculate Taxable Income for Bracket lookup? 
        // Technically bracket is based on Taxable Income, not Gross. 
        // Let's assume input is Gross.

        // 1. Estimate Taxable Income (using 2025 Standard Ded as baseline)
        const stdDed = getStandardDeduction("2025", status, inputAge.checked, taxRules);
        const taxableIncome = Math.max(0, income - stdDed);

        // Fed Bracket
        // Lookup using specific Filing Status brackets
        const brackets = taxRules.federal_brackets_2025[status] || taxRules.federal_brackets_2025.single;
        const fedBracketObj = getMarginalTaxRate(taxableIncome, brackets);

        displayFedBracket.value = `${(fedBracketObj.rate * 100).toFixed(0)}%`;
        displayFedBracket.dataset.rate = fedBracketObj.rate; // Store raw rate

        // NJ Rate (Effective)
        const estTax = estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
        const effRate = (estTax / income) * 100;
        inputNJRate.value = effRate.toFixed(2);
    }

    function calculateScenario() {
        if (!window.currentProperty || !taxRules) return;

        // 1. GATHER INPUTS
        const age65 = inputAge.checked;
        const age = age65 ? 75 : 40;
        const filingStatus = selFilingStatus.value;

        let income = null;
        if (manualIncome.value.trim() !== "") {
            income = parseFloat(manualIncome.value.replace(/,/g, ''));
        }

        const years = inputYears.checked ? 10 : 0;
        const baseTaxStr = inputBaseTax.value.replace(/,/g, '');
        const baseTax = parseFloat(baseTaxStr) || 0;
        const isHomeowner = document.querySelector('input[name="status"]:checked').value === 'homeowner';

        // Itemized Inputs
        const userMortgage = parseFloat(inputMortgage.value.replace(/,/g, '')) || 0;
        const userCharity = parseFloat(inputCharity.value.replace(/,/g, '')) || 0;

        // 2. GET FEDERAL BRACKET (From Data Attribute set by updateBracketFromIncome)
        let fedBracket = parseFloat(displayFedBracket.dataset.rate) || 0;

        // If user hasn't entered income, we can't really calculate tax benefits, default to 24% for generic?
        // No, keep 0 if unknown.

        // GET NJ RATE
        let njRate = 0;
        const njRateVal = parseFloat(inputNJRate.value);
        if (!isNaN(njRateVal)) {
            njRate = njRateVal / 100.0;
        }

        // Base Data
        const val25 = parseFloat(window.currentProperty.assessment_2025);
        const val26 = parseFloat(window.currentProperty.assessment_2026);
        const tax25 = val25 * TAX_RATE_2025;
        const tax26Yes = val26 * TAX_RATE_2026_YES;
        const tax26No = val26 * TAX_RATE_2026_EST;

        // 3. CALCULATE RELIEF
        let relief_yes = { anchor: 0, freeze: 0, staynj: 0, total: 0 };
        let relief_no = { anchor: 0, freeze: 0, staynj: 0, total: 0 };

        // Only calc relief if we have minimal inputs or assume eligible? 
        // Defaults (age 40, income 0) usually mean no relief.
        relief_yes = calculateRelief(age, income, years, baseTax, isHomeowner, tax26Yes, taxRules);
        relief_no = calculateRelief(age, income, years, baseTax, isHomeowner, tax26No, taxRules);

        // Show Relief Breakdown
        document.getElementById('reliefBreakdown').classList.remove('hidden');
        document.getElementById('valAnchor').textContent = formatCurrency(relief_yes.anchor);
        document.getElementById('valFreeze').textContent = formatCurrency(relief_yes.freeze);
        document.getElementById('valStayNJ').textContent = formatCurrency(relief_yes.staynj);
        document.getElementById('valTotalRelief').textContent = formatCurrency(relief_yes.total);

        // Show PAS-1 Prompt
        const pas1Msg = document.getElementById('msgPas1');
        if (relief_yes.total > 0) {
            pas1Msg.classList.remove('hidden');
        } else {
            pas1Msg.classList.add('hidden');
        }

        // 4. SUMMARY & NET COST WITH DEDUCTION LOGIC
        let estNJIncomeTax = 0;
        if (income > 0) {
            estNJIncomeTax = estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
        }

        // --- Helper Calculation for Net Cost ---
        const calcNetCost = (yearLabel, propTax, reliefObj, rulesKey) => {
            // 1. Determine SALT Cap
            const saltCap = calculateSaltLimit(income, taxRules.salt_caps[rulesKey]);

            // 2. Determine SALT Deduction (limited by cap)
            // Reduced Itemized Deduction: StayNJ benefit reduces deductible property tax
            // We need to know the specific StayNJ amount for this scenario. 
            // reliefTotal includes Anchor + Freeze + StayNJ. 
            // Since we passed reliefTotal, we might need to recalculate or extract StayNJ?
            // Actually, we passed `reliefTotal` but not the breakdown. 
            // Let's assume for now we use the `relief_yes.staynj` etc. from the scope? 
            // Reduced Itemized Deduction: Relief benefits (Anchor, Freeze, StayNJ) reduce deductible property tax.
            // Reference: IRS Pub 530 (Rebates/Refunds reduce deduction).
            const reliefTotal = reliefObj ? reliefObj.total : 0;
            const deductiblePropTax = Math.max(0, propTax - reliefTotal);

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

            // 6. Federal Tax Benefit of PROPERTY TAX
            // To be precise: Benefit = TaxWithoutPropTax - TaxWithPropTax
            // Simplified Marginal Approach: 
            // The property tax contributes to the 'allowedSALT'.
            // If Standard > Itemized (even with prop tax), Benefit = 0.
            // If Itemized > Standard, Benefit is tricky.
            // Let's use the marginal rate on the amount that *exceeds* the standard deduction threshold due to this property tax?
            // Easier: (New Taxable Income - Old Taxable Income) * Rate?

            // Let's calculate Taxable Income with and without Property Tax
            // Case A: With Property Tax
            const taxIncA = Math.max(0, income - effectiveDed);

            // Case B: Without Property Tax
            // SALT becomes just NJ Income Tax (and NO Relief reduction relevant here?)
            const saltB = Math.min(estNJIncomeTax, saltCap);
            const itemizedB = userMortgage + userCharity + saltB;
            const effectiveDedB = Math.max(itemizedB, stdDed);
            const taxIncB = Math.max(0, income - effectiveDedB);

            const deductableDiff = taxIncB - taxIncA; // Positive number
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
                isSaltCapped: totalSALT > saltCap
            };
        };

        // 2025 Baseline
        // 2025 Relief Rules (No StayNJ)
        const rules25 = JSON.parse(JSON.stringify(taxRules));
        rules25.Stay_NJ.benefit_cap = 0;
        rules25.Stay_NJ.total_relief_cap = 999999;

        let relief_25 = calculateRelief(age, income, years, baseTax, isHomeowner, tax25, rules25);
        // if (income === 0) relief_25 = { total: 0, anchor: 0, freeze: 0, staynj: 0 }; // Removed: 0 income should qualify. Null handles empty.

        const res25 = calcNetCost("2025", tax25, relief_25, "2025");
        const resNo = calcNetCost("2026", tax26No, relief_no, "2026"); // Uses 2026_est logic
        const resYes = calcNetCost("2026", tax26Yes, relief_yes, "2026");

        // UI Updates for Differences
        const reliefDiff = relief_yes.total - relief_25.total;
        document.getElementById('valReliefDiff').textContent = `(vs 2025: ${formatChange(reliefDiff)})`;
        updateDiff('valAnchorDiff', relief_yes.anchor, relief_25.anchor);
        updateDiff('valFreezeDiff', relief_yes.freeze, relief_25.freeze);
        updateDiff('valStayNJDiff', relief_yes.staynj, relief_25.staynj);

        const netCost25 = res25.netCost;
        const netCost26No = resNo.netCost;
        const netCost26Yes = resYes.netCost;

        // Render Summary - 2025 ACTUAL
        document.getElementById('sumGrossTax25').textContent = formatCurrency(tax25);
        document.getElementById('sumNJRelief25').textContent = `-${formatCurrency(relief_25.total)}`;
        document.getElementById('sumNetProp25').textContent = formatCurrency(tax25 - relief_25.total);
        document.getElementById('sumNJIncomeTax25').textContent = formatCurrency(estNJIncomeTax);

        // Detailed Deduction 2025
        document.getElementById('valStdDed25').textContent = formatCurrency(res25.stdDed);
        document.getElementById('valSaltDed25').textContent = formatCurrency(res25.saltDed);
        document.getElementById('valOtherDed25').textContent = formatCurrency(res25.otherDed);
        document.getElementById('valTotalItemized25').textContent = formatCurrency(res25.totalItemized);
        document.getElementById('lblDedType25').textContent = `(${res25.labelDed})`;
        document.getElementById('sumDed25').textContent = formatCurrency(res25.deductionUsed);

        document.getElementById('sumFedBenefit25').textContent = `-${formatCurrency(res25.fedBenefit)}`;
        document.getElementById('sumFinalCost25').textContent = formatCurrency(netCost25);

        // Render Summary - NO VOTE
        document.getElementById('sumGrossTaxNo').textContent = formatCurrency(tax26No);
        document.getElementById('sumNJReliefNo').textContent = `-${formatCurrency(relief_no.total)}`;
        document.getElementById('sumNetPropNo').textContent = formatCurrency(tax26No - relief_no.total);
        document.getElementById('sumNJIncomeTaxNo').textContent = formatCurrency(estNJIncomeTax);

        // Detailed Deduction No Vote
        document.getElementById('valStdDedNo').textContent = formatCurrency(resNo.stdDed);
        document.getElementById('valSaltDedNo').textContent = formatCurrency(resNo.saltDed);
        document.getElementById('valOtherDedNo').textContent = formatCurrency(resNo.otherDed);
        document.getElementById('valTotalItemizedNo').textContent = formatCurrency(resNo.totalItemized);
        document.getElementById('sumDedNo').textContent = formatCurrency(resNo.deductionUsed);

        document.getElementById('sumFedBenefitNo').textContent = `-${formatCurrency(resNo.fedBenefit)}`;
        document.getElementById('sumFinalCostNo').textContent = formatCurrency(netCost26No);

        // Render Summary - YES VOTE
        document.getElementById('sumGrossTax').textContent = formatCurrency(tax26Yes);
        document.getElementById('sumNJRelief').textContent = `-${formatCurrency(relief_yes.total)}`;
        document.getElementById('sumNetProp').textContent = formatCurrency(tax26Yes - relief_yes.total);
        document.getElementById('sumNJIncomeTax').textContent = formatCurrency(estNJIncomeTax);

        // Detailed Deduction Yes Vote
        document.getElementById('valStdDed').textContent = formatCurrency(resYes.stdDed);
        document.getElementById('valSaltDed').textContent = formatCurrency(resYes.saltDed);
        document.getElementById('valOtherDed').textContent = formatCurrency(resYes.otherDed);
        document.getElementById('valTotalItemized').textContent = formatCurrency(resYes.totalItemized);
        document.getElementById('sumDed').textContent = formatCurrency(resYes.deductionUsed);

        document.getElementById('sumFedBenefit').textContent = `-${formatCurrency(resYes.fedBenefit)}`;
        document.getElementById('sumFinalCost').textContent = formatCurrency(netCost26Yes);

        // Impact vs 2025
        const changeNo = netCost26No - netCost25;
        const changeYes = netCost26Yes - netCost25;

        const cellNo = document.getElementById('sumChangeNo');
        const cellYes = document.getElementById('sumChangeYes');

        cellNo.textContent = formatChange(changeNo);
        styleChangeCell(cellNo, changeNo);

        cellYes.textContent = formatChange(changeYes);
        styleChangeCell(cellYes, changeYes);

        // Update SALT Label if Capped in 2026 scenarios
        const isCapped = resNo.isSaltCapped || resYes.isSaltCapped;
        document.getElementById('lblSaltDedRow').textContent = isCapped ? "SALT Deduction (Capped)" : "SALT Deduction";
    }

    function formatChange(val) {
        const sign = val >= 0 ? '+' : '';
        return `${sign}${formatCurrency(Math.abs(val))}`; // Fix: abs to prevent --$500
    }

    function styleChangeCell(element, val) {
        if (val <= 0) {
            element.style.color = "#16a34a"; // Green (Savings or $0)
        } else {
            element.style.color = "#dc2626"; // Red (Increase)
        }
    }

    function updateDiff(elementId, val26, val25) {
        const el = document.getElementById(elementId);
        if (val26 === 0 && val25 === 0) {
            el.textContent = "";
            return;
        }
        const diff = val26 - val25;
        // e.g. "(+ $1,000)" or "(- $500)" or "($0)"
        el.textContent = `(${formatChange(diff)})`;
    }

    // Helper: Calculate Relief
    function calculateRelief(age, income, years, baseTax, isHomeowner, currentTax, rules) {
        let r = { anchor: 0, freeze: 0, staynj: 0, total: 0 };

        // If income is not provided (null), assume no eligibility for means-tested benefits
        if (income === null || income === undefined || isNaN(income)) {
            return r;
        }

        // 1. Freeze
        // checks: age, years, income limits. 
        // CRITICAL: baseTax must be > 0 (user entered it), otherwise we assume not enrolled or base not established.
        if (age >= rules.Senior_Freeze.age_min && years >= rules.Senior_Freeze.years_in_home_min && income <= rules.Senior_Freeze.income_limit_2025) {
            if (baseTax > 0 && currentTax > baseTax) {
                r.freeze = currentTax - baseTax;
            }
        }

        // 2. Anchor
        const ruleAnchor = rules.ANCHOR;
        if (isHomeowner) {
            if (income <= ruleAnchor.homeowner.tier1.limit) r.anchor += ruleAnchor.homeowner.tier1.base;
            else if (income <= ruleAnchor.homeowner.tier2.limit) r.anchor += ruleAnchor.homeowner.tier2.base;

            if (age >= ruleAnchor.homeowner.bonus_age && r.anchor > 0) r.anchor += ruleAnchor.homeowner.bonus_amount;
        } else {
            if (income <= ruleAnchor.renter.tier1.limit) r.anchor += ruleAnchor.renter.tier1.base;
            if (age >= ruleAnchor.renter.bonus_age && r.anchor > 0) r.anchor += ruleAnchor.renter.bonus_amount;
        }

        // 3. Stay NJ
        // NOTE: StayNJ uses INCOME (AGI) Limit, not Bracket. 
        const ruleStay = rules.Stay_NJ;
        if (isHomeowner && age >= ruleStay.age_min && income < ruleStay.income_limit) {
            const target = Math.min(currentTax * ruleStay.benefit_percent, ruleStay.benefit_cap);
            const existing = r.freeze + r.anchor;
            if (target > existing) {
                r.staynj = target - existing;
            }
        }

        r.total = r.anchor + r.freeze + r.staynj;
        return r;
    }

    // Helper: Estimate NJ Tax
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


    function getMarginalTaxRate(income, brackets) {
        if (!brackets) return { rate: 0.24, label: "24%" };
        for (let b of brackets) {
            if (income <= b.limit) return b;
        }
        return brackets[brackets.length - 1];
    }

    // Global var for rules to be accessible
    // Load Rules & Data
    let taxRules = null;
    fetch('assets/tax_rules.json')
        .then(res => res.json())
        .then(data => {
            taxRules = data.programs;
            window.taxRules = taxRules; // Make accessible
        })
        .catch(err => console.error('Error loading tax rules:', err));

});

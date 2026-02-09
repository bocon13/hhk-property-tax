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
    fetch('assets/assessment_data.json')
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

        // Display Assessments
        // val2026 removed from top display

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

    // --- SCENARIO CALCULATION        // UI Elements
    // const btnRecalculate = document.getElementById('btnRecalculate'); // Removed
    const inputAge = document.getElementById('chkAge65'); // Checkbox
    const selIncome = document.getElementById('selIncome'); // Select Dropdown
    const manualIncome = document.getElementById('manualIncome'); // Manual Input
    const inputFedBracket = document.getElementById('inputFedBracket'); // Select
    const inputNJRate = document.getElementById('inputNJRate'); // Hidden Input
    const inputYears = document.getElementById('chkYearsBase'); // Checkbox
    const inputBaseTax = document.getElementById('inputBaseTax');
    const radioStatus = document.querySelectorAll('input[name="status"]');

    // Tax Rates
    // TAX_RATE_2025 = 0.02501 defined at top
    // TAX_RATE_2026_EST = 0.01436 defined at top
    const TAX_RATE_2026_YES = 0.01580; // Estimated with School Budget (1.436 + 0.144)

    // Event Listeners for Live Update
    // btnRecalculate.addEventListener('click', calculateScenario); // Removed button
    inputAge.addEventListener('change', calculateScenario);

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

    inputFedBracket.addEventListener('change', () => {
        // If user picks a bracket, suggest a valid income for that bracket
        // purely to be helpful so the math works immediately.
        const bracket = parseFloat(inputFedBracket.value);
        if (!isNaN(bracket)) {
            let suggested = 0;
            switch (bracket) {
                case 10: suggested = 22000; break;
                case 12: suggested = 48000; break;
                case 22: suggested = 135000; break;
                case 24: suggested = 270000; break;
                case 32: suggested = 430000; break;
                case 35: suggested = 585000; break;
                case 37: suggested = 800000; break;
            }

            // Only auto-fill if the current income is "out of sync" or empty? 
            // User asked "pick a sensible Household income", implying they want it set.
            // We'll update it.
            if (suggested > 0) {
                manualIncome.value = new Intl.NumberFormat('en-US').format(suggested);
                // Also sync the dropdown if it matches perfectly, otherwise clear it
                // Actually simple is best: just set the text.
            }
        }
        calculateScenario();
    });
    // inputNJRate.addEventListener('input', calculateScenario); // Hidden, driven by logic
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

    // Helper: Calculate SALT Deduction Limit with Phase-out
    function calculateSaltLimit(income, rule) {
        if (typeof rule === 'number') return rule;

        // If we have no income data, assume full deduction (optimistic) or base? 
        // Actually, if income is null, we usually default to base_limit in the calling code, but here we expect income.
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
            inputFedBracket.value = "";
            inputNJRate.value = "";
            return;
        }

        const income = parseFloat(incomeVal);

        // Fed Bracket
        const fedBracketObj = getMarginalTaxRate(income, taxRules.federal_brackets);
        // Convert 0.24 to "24" to match select options
        inputFedBracket.value = (fedBracketObj.rate * 100).toFixed(0);

        // NJ Rate (Effective)
        const estTax = estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
        const effRate = (estTax / income) * 100;
        inputNJRate.value = effRate.toFixed(2);
    }

    function calculateScenario() {
        if (!window.currentProperty || !taxRules) return;

        // 1. GATHER INPUTS
        // Map booleans to safe eligibility numbers
        const age = inputAge.checked ? 75 : 40;

        // Income is purely for eligibility now, bracket is separate
        let income = null;
        if (manualIncome.value !== "") {
            income = parseFloat(manualIncome.value.replace(/,/g, ''));
        }

        const years = inputYears.checked ? 10 : 0;

        // Parse formatted base tax string
        const baseTaxStr = inputBaseTax.value.replace(/,/g, '');
        const baseTax = parseFloat(baseTaxStr) || 0;

        const isHomeowner = document.querySelector('input[name="status"]:checked').value === 'homeowner';

        // 2. GET FEDERAL BRACKET (From Select)
        let fedBracket = 0;
        const bracketVal = parseFloat(inputFedBracket.value);
        if (!isNaN(bracketVal)) {
            fedBracket = bracketVal / 100.0;
        }

        // GET NJ RATE (From Input)
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

        if (income !== null) {
            relief_yes = calculateRelief(age, income, years, baseTax, isHomeowner, tax26Yes, taxRules);
            relief_no = calculateRelief(age, income, years, baseTax, isHomeowner, tax26No, taxRules);
        }

        // Show Relief Breakdown (Showing YES vote figures in the breakdown for detail)
        document.getElementById('reliefBreakdown').classList.remove('hidden');
        document.getElementById('valAnchor').textContent = formatCurrency(relief_yes.anchor);
        document.getElementById('valFreeze').textContent = formatCurrency(relief_yes.freeze);
        document.getElementById('valStayNJ').textContent = formatCurrency(relief_yes.staynj);
        document.getElementById('valTotalRelief').textContent = formatCurrency(relief_yes.total);

        // Show PAS-1 Prompt if Relief > 0
        const pas1Msg = document.getElementById('msgPas1');
        if (relief_yes.total > 0) {
            pas1Msg.classList.remove('hidden');


        } else {
            pas1Msg.classList.add('hidden');

        }

        // 4. SUMMARY & NET COST
        let estNJIncomeTax = 0;
        if (income !== null) {
            // Calculate directly for precision (ignore hidden rounded input)
            estNJIncomeTax = estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
        }

        // 2025 Baseline
        // Calculate Relief for 2025 (No Stay NJ, No Cap implied by Stay NJ legislation)
        const rules25 = JSON.parse(JSON.stringify(taxRules));
        rules25.Stay_NJ.benefit_cap = 0;
        rules25.Stay_NJ.total_relief_cap = 999999;

        let relief_25 = { anchor: 0, freeze: 0, staynj: 0, total: 0 };
        if (income !== null) {
            relief_25 = calculateRelief(age, income, years, baseTax, isHomeowner, tax25, rules25);
        }

        const reliefDiff = relief_yes.total - relief_25.total;
        const diffSpan = document.getElementById('valReliefDiff');
        diffSpan.textContent = `(vs 2025: ${formatChange(reliefDiff)})`;

        // Individual Differences
        updateDiff('valAnchorDiff', relief_yes.anchor, relief_25.anchor);
        updateDiff('valFreezeDiff', relief_yes.freeze, relief_25.freeze);
        updateDiff('valStayNJDiff', relief_yes.staynj, relief_25.staynj);

        // Net Cost 2025
        const saltCap25 = calculateSaltLimit(income, taxRules.salt_caps["2025"]);
        let fedDed25 = 0;
        let fedBenefit25 = 0;
        if (income !== null) {
            const dedTotal = Math.min(tax25 + estNJIncomeTax, saltCap25);
            const dedInc = Math.min(estNJIncomeTax, saltCap25);
            fedDed25 = dedTotal;
            fedBenefit25 = (dedTotal - dedInc) * fedBracket;
        }
        const netCost25 = tax25 - relief_25.total - fedBenefit25;

        // 2026 Model (No Vote)
        const saltCap26 = calculateSaltLimit(income, taxRules.salt_caps["2026"]);
        let fedDed26No = 0;
        let fedBenefit26No = 0;
        if (income !== null) {
            const dedTotal = Math.min(tax26No + estNJIncomeTax, saltCap26);
            const dedInc = Math.min(estNJIncomeTax, saltCap26);
            fedDed26No = dedTotal;
            fedBenefit26No = (dedTotal - dedInc) * fedBracket;
        }
        const netCost26No = tax26No - relief_no.total - fedBenefit26No;

        // 2026 Model (Yes Vote)
        let fedDed26Yes = 0;
        let fedBenefit26Yes = 0;
        if (income !== null) {
            const dedTotal = Math.min(tax26Yes + estNJIncomeTax, saltCap26);
            const dedInc = Math.min(estNJIncomeTax, saltCap26);
            fedDed26Yes = dedTotal;
            fedBenefit26Yes = (dedTotal - dedInc) * fedBracket;
        }
        const netCost26Yes = tax26Yes - relief_yes.total - fedBenefit26Yes;

        // Render Summary - 2025 ACTUAL
        document.getElementById('sumGrossTax25').textContent = formatCurrency(tax25);
        document.getElementById('sumNJRelief25').textContent = `-${formatCurrency(relief_25.total)}`;
        document.getElementById('sumNetProp25').textContent = formatCurrency(tax25 - relief_25.total);
        document.getElementById('sumNJIncomeTax25').textContent = formatCurrency(estNJIncomeTax);
        document.getElementById('sumSaltDed25').textContent = formatCurrency(fedDed25);
        document.getElementById('sumFedBenefit25').textContent = `-${formatCurrency(fedBenefit25)}`;
        document.getElementById('sumFinalCost25').textContent = formatCurrency(netCost25);

        // Render Summary - NO VOTE
        document.getElementById('sumGrossTaxNo').textContent = formatCurrency(tax26No);
        document.getElementById('sumNJReliefNo').textContent = `-${formatCurrency(relief_no.total)}`;
        document.getElementById('sumNetPropNo').textContent = formatCurrency(tax26No - relief_no.total);
        document.getElementById('sumNJIncomeTaxNo').textContent = formatCurrency(estNJIncomeTax);
        document.getElementById('sumSaltDedNo').textContent = formatCurrency(fedDed26No);
        document.getElementById('sumFedBenefitNo').textContent = `-${formatCurrency(fedBenefit26No)}`;
        document.getElementById('sumFinalCostNo').textContent = formatCurrency(netCost26No);

        // Render Summary - YES VOTE
        document.getElementById('sumGrossTax').textContent = formatCurrency(tax26Yes);
        document.getElementById('sumNJRelief').textContent = `-${formatCurrency(relief_yes.total)}`;
        document.getElementById('sumNetProp').textContent = formatCurrency(tax26Yes - relief_yes.total);

        document.getElementById('sumNJIncomeTax').textContent = formatCurrency(estNJIncomeTax);
        document.getElementById('sumSaltDed').textContent = formatCurrency(fedDed26Yes);
        document.getElementById('sumFedBenefit').textContent = `-${formatCurrency(fedBenefit26Yes)}`;

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
    }

    function formatChange(val) {
        const sign = val >= 0 ? '+' : '';
        return `${sign}${formatCurrency(val)}`;
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

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

        // 1. Estimate Taxable Income (using 2025 Standard Ded as baseline)
        const stdDed = TaxLogic.getStandardDeduction("2025", status, inputAge.checked, taxRules);
        const taxableIncome = Math.max(0, income - stdDed);

        // Fed Bracket
        const brackets = taxRules.federal_brackets_2025[status] || taxRules.federal_brackets_2025.single;
        const fedBracketObj = TaxLogic.getMarginalTaxRate(taxableIncome, brackets);

        displayFedBracket.value = `${(fedBracketObj.rate * 100).toFixed(0)}%`;
        displayFedBracket.dataset.rate = fedBracketObj.rate; // Store raw rate

        // NJ Rate (Effective)
        const estTax = TaxLogic.estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
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

        relief_yes = TaxLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax26Yes, taxRules);
        relief_no = TaxLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax26No, taxRules);

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
            estNJIncomeTax = TaxLogic.estimateNJIncomeTax(income, taxRules.nj_income_tax_estimates);
        }

        // --- Helper Calculation for Net Cost ---
        const calcNetCost = (yearLabel, propTax, reliefObj, rulesKey) => {
            const inputs = {
                income, filingStatus, age65, userMortgage, userCharity, rulesKeySalt: rulesKey
            };
            return TaxLogic.calcNetCost(yearLabel, propTax, reliefObj, rulesKey, inputs, taxRules);
        };

        // 2025 Baseline
        // 2025 Relief Rules (No StayNJ)
        const rules25 = JSON.parse(JSON.stringify(taxRules));
        rules25.Stay_NJ.benefit_cap = 0;
        rules25.Stay_NJ.total_relief_cap = 999999;

        let relief_25 = TaxLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax25, rules25);

        const res25 = calcNetCost("2025", tax25, relief_25, "2025");
        const resNo = calcNetCost("2026", tax26No, relief_no, "2026");
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
        return `${sign}${formatCurrency(Math.abs(val))}`;
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
        el.textContent = `(${formatChange(diff)})`;
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

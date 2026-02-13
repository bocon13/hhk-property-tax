document.addEventListener('DOMContentLoaded', () => {
    let properties = [];
    const searchInput = document.getElementById('addressInput');
    const suggestionsBox = document.getElementById('suggestions');
    const resultsSection = document.getElementById('results');
    const voteToggle = document.getElementById('voteToggle');

    // Constants
    const TAX_RATE_2023 = 0.02330; // 2.330%
    const TAX_RATE_2024 = 0.02407; // 2.407%
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

        // Prefill Base Year Tax with 2024 Est. Tax (Default for new applicants)
        const tax24 = val2025 * TAX_RATE_2024;
        document.getElementById('inputBaseTax').value = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(tax24);

        // Initial Calculation with defaults
        calculateScenario();
    }

    // --- SCENARIO CALCULATION
    // UI Elements
    const inputAge = document.getElementById('chkAge65'); // Checkbox
    const selIncome = document.getElementById('selIncome'); // Select Dropdown
    const selYears = document.getElementById('selYears'); // Select Dropdown
    const chkApplied2025 = document.getElementById('chkApplied2025'); // Checkbox
    const inputBaseTax = document.getElementById('inputBaseTax');
    const radioStatus = document.querySelectorAll('input[name="status"]');

    // Tax Rates
    // TAX_RATE_2025 = 0.02501 defined at top
    // TAX_RATE_2026_EST = 0.01436 defined at top
    const TAX_RATE_2026_YES = 0.01580; // Estimated with School Budget (1.436 + 0.144)

    // Event Listeners for Live Update
    inputAge.addEventListener('change', calculateScenario);

    // Dropdown change triggers calculation
    selIncome.addEventListener('change', calculateScenario);

    selYears.addEventListener('change', calculateScenario);
    chkApplied2025.addEventListener('change', calculateScenario);
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

    function calculateScenario() {
        if (!window.currentProperty || !taxRules) return;

        // 1. GATHER INPUTS
        const age65 = inputAge.checked;
        const age = age65 ? 75 : 40;

        let income = null;
        if (selIncome.value !== "") {
            income = parseFloat(selIncome.value);
        }

        const years = parseFloat(selYears.value);
        const baseTaxStr = inputBaseTax.value.replace(/,/g, '');
        const baseTax = parseFloat(baseTaxStr) || 0;
        const isHomeowner = document.querySelector('input[name="status"]:checked').value === 'homeowner';

        // Base Data
        const val25 = parseFloat(window.currentProperty.assessment_2025);
        const val26 = parseFloat(window.currentProperty.assessment_2026);
        const tax25 = val25 * TAX_RATE_2025;
        const tax26Yes = val26 * TAX_RATE_2026_YES;
        const tax26No = val26 * TAX_RATE_2026_EST;

        // 2. CALCULATE RELIEF
        let relief_yes = { anchor: 0, freeze: 0, staynj: 0, total: 0 };
        let relief_no = { anchor: 0, freeze: 0, staynj: 0, total: 0 };

        relief_yes = RebateLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax26Yes, taxRules);
        relief_no = RebateLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax26No, taxRules);

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

        // 3. SUMMARY & NET COST

        // 2025 Baseline Calculations
        let relief_25 = { anchor: 0, freeze: 0, staynj: 0, total: 0 };

        if (chkApplied2025.checked) {
            // User indicated they qualify/applied for 2025 relief.
            // We calculate full benefits (Anchor + Freeze + StayNJ) based on 2025 Tax.
            // Note: Simplification assumes 2025 rules/limits apply to 2025 tax year for modeling purposes.
            relief_25 = RebateLogic.calculateRelief(age, income, years, baseTax, isHomeowner, tax25, taxRules);
        }

        // UI Updates for Differences
        const reliefDiff = relief_yes.total - relief_25.total;
        document.getElementById('valReliefDiff').textContent = `(vs 2025: ${formatChange(reliefDiff)})`;
        updateDiff('valAnchorDiff', relief_yes.anchor, relief_25.anchor);
        updateDiff('valFreezeDiff', relief_yes.freeze, relief_25.freeze);
        updateDiff('valStayNJDiff', relief_yes.staynj, relief_25.staynj);

        const netCost25 = tax25 - relief_25.total;
        const netCost26No = tax26No - relief_no.total;
        const netCost26Yes = tax26Yes - relief_yes.total;

        // Render Summary - 2025 ACTUAL
        document.getElementById('sumGrossTax25').textContent = formatCurrency(tax25);
        document.getElementById('sumNJRelief25').textContent = relief_25.total > 0 ? `-${formatCurrency(relief_25.total)}` : '-';
        document.getElementById('sumNetProp25').textContent = formatCurrency(netCost25);

        // Render Summary - NO VOTE
        document.getElementById('sumGrossTaxNo').textContent = formatCurrency(tax26No);
        document.getElementById('sumNJReliefNo').textContent = `-${formatCurrency(relief_no.total)}`;
        document.getElementById('sumNetPropNo').textContent = formatCurrency(netCost26No);

        // Render Summary - YES VOTE
        document.getElementById('sumGrossTax').textContent = formatCurrency(tax26Yes);
        document.getElementById('sumNJRelief').textContent = `-${formatCurrency(relief_yes.total)}`;
        document.getElementById('sumNetProp').textContent = formatCurrency(netCost26Yes);

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
        const sign = val >= 0 ? '+' : '-';
        return `${sign}${formatCurrency(Math.abs(val))}`;
    }

    function styleReliefDiff(element, val) {
        if (val < 0) {
            element.style.color = "#dc2626"; // Red (Decreased Relief)
        } else {
            element.style.color = "#16a34a"; // Green (Increased Relief)
        }
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
        styleReliefDiff(el, diff);
    }

    // Global var for rules to be accessible
    // Load Rules & Data
    let taxRules = null;
    fetch('assets/rebate_rules.json?v=' + new Date().getTime())
        .then(res => res.json())
        .then(data => {
            taxRules = data.programs;
            // Simplified global assignment
            window.taxRules = taxRules;
        })
        .catch(err => console.error('Error loading tax rules:', err));

});

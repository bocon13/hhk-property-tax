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

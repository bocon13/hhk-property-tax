# Analysis & Data Processing

This directory contains the source data and processing scripts for the Ho-Ho-Kus Assessment Calculator.

## Source Data
- **Ho-Ho-Kus 2026 Preliminary Residential Assessments.xlsx**: Official assessment data source.
- **Ho-Ho-Kus 2026 Preliminary Tax Worksheet.xlsx**: Tax calculation worksheet.
- ***.pdf**: Reference documents for rebate programs (PAS-1).

## Scripts
- **process_data.py**: The main script. Reads the Excel assessment data and generates the `assets/data.json` file used by the web application.
  - Usage: `python3 analysis/process_data.py`

## Output
The scripts in this directory output to `../assets/data.json`.

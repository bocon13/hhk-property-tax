import pandas as pd
import json
import os

# Define input file
script_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(script_dir, "Ho-Ho-Kus 2026 Preliminary Residential Assessments.xlsx")
output_file = "assets/assessment_data.json"

# Ensure assets directory exists
os.makedirs("assets", exist_ok=True)

try:
    print(f"Reading {input_file}...")
    # Read the first sheet
    df = pd.read_excel(input_file)
    
    # Check for expected columns
    expected_cols = ["Location", "2025 Assessment", "Proposed 2026\nAssessment"]
    
    # Select and rename columns for JSON output
    # Note: 'Location' might need cleaning to be consistent
    data = []
    
    # Iterate through rows and extract data
    for index, row in df.iterrows():
        try:
            location = str(row["Location"]).strip()
            # Clean up location (remove formatting issues if any)
            
            # Handle potential NaN or non-numeric values for assessments
            assessment_2025 = row["2025 Assessment"]
            assessment_2026 = row["Proposed 2026\nAssessment"]
            
            # Simple validation: ensure we have an address and it's not a header
            if location and location.lower() != "nan" and location.lower() != "location":
                entry = {
                    "address": location,
                    "assessment_2025": assessment_2025,
                    "assessment_2026": assessment_2026
                }
                data.append(entry)
                
        except Exception as e:
            print(f"Skipping row {index}: {e}")
            
    print(f"Extracted {len(data)} records.")
    
    # Save to JSON
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
        
    print(f"Saved data to {output_file}")
    
except Exception as e:
    print(f"Error processing data: {e}")

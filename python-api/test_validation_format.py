"""Quick test to check validation format"""
import sys
sys.path.insert(0, '/Users/ravonstrawder/Desktop/Britta/python-api')

from app.svensk_ekonomi.vat_processor import VATProcessor
import pandas as pd

# Create test data with missing org_number to trigger validation error
processor = VATProcessor()

df = pd.DataFrame([
    {
        'amount': 100,
        'subAmount': 80,
        'vat': 20,
        'vatRate': 25,
        'transactionName': 'Test'
    }
])

# Process with empty org_number to trigger validation error
result = processor.process_transactions(
    df=df,
    company_name="Test AB",
    org_number="invalid",  # This should trigger validation error
    period="2025-12"
)

# Check validation format
print("="*60)
print("VALIDATION OBJECT:")
print(result['validation'])
print("="*60)
print("\nERRORS TYPE:", type(result['validation']['errors']))
print("ERRORS CONTENT:", result['validation']['errors'])
print("\nWARNINGS TYPE:", type(result['validation']['warnings']))
print("WARNINGS CONTENT:", result['validation']['warnings'])

# Check if errors are strings or dicts
if result['validation']['errors']:
    print("\nFIRST ERROR TYPE:", type(result['validation']['errors'][0]))
    print("FIRST ERROR VALUE:", result['validation']['errors'][0])

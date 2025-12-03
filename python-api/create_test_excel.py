#!/usr/bin/env python3
"""Create test Excel file for VAT analysis"""
import pandas as pd
from decimal import Decimal

# Sample EV charging transactions
transactions = [
    # Sales with 25% VAT
    # Net: 65.16, VAT: 16.29 -> Gross: 81.45
    {
        "id": "TX001",
        "amount": 81.45,
        "subAmount": 65.16,
        "vat": 16.29,
        "vatRate": 25,
        "transactionName": "Elbilsladdning - Station 1",
        "kwh": 20.5
    },
    # Roaming (0% VAT)
    # Net: 233.65, VAT: 0 -> Gross: 233.65
    {
        "id": "TX002",
        "amount": 233.65,
        "subAmount": 233.65,
        "vat": 0.00,
        "vatRate": 0,
        "transactionName": "Roaming intäkter - Hubject",
        "kwh": 30.0
    },
    # Costs (negative amounts)
    # Cost 1: Net -406.16, VAT -101.54 -> Gross -507.70
    {
        "id": "TX003",
        "amount": -507.70,
        "subAmount": -406.16,
        "vat": -101.54,
        "vatRate": 25,
        "transactionName": "Plattformsavgift - Monta",
    },
    # Cost 2: Net -20.32, VAT 0 -> Gross -20.32
    {
        "id": "TX004",
        "amount": -20.32,
        "subAmount": -20.32,
        "vat": 0.00,
        "vatRate": 0,
        "transactionName": "Övriga kostnader (momsfri)",
    },
]

# Create DataFrame
df = pd.DataFrame(transactions)

# Save to Excel
output_file = "test_transactions.xlsx"
df.to_excel(output_file, index=False, engine='openpyxl')

print(f"✅ Created test Excel file: {output_file}")
print(f"   Transactions: {len(df)}")
print(f"   Sales: {len(df[df['amount'] > 0])}")
print(f"   Costs: {len(df[df['amount'] < 0])}")

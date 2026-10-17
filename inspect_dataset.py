import pandas as pd
from pathlib import Path

DATA_PATH = Path("dataa diabetes/diabetic_data.csv")

df = pd.read_csv(DATA_PATH)

print("\n=== DATASET OVERVIEW ===")
print("Rows:", df.shape[0])
print("Columns:", df.shape[1])

print("\n=== COLUMN NAMES ===")
print(df.columns.tolist())

print("\n=== FIRST 5 ROWS ===")
print(df.head().to_string())

print("\n=== MISSING VALUES ===")
print(df.isnull().sum().sort_values(ascending=False).head(15))

print("\n=== DATA TYPES ===")
print(df.dtypes)

print("\n=== PATIENT ENCOUNTERS ===")
print("Unique patient IDs:", df["patient_nbr"].nunique())
print("Unique encounter IDs:", df["encounter_id"].nunique())
print("Repeated patient records:", df.duplicated("patient_nbr").sum())




print("\n=== MISSING VALUE PERCENTAGES ===")
missing_pct = (df.isnull().sum() / len(df) * 100).sort_values(
    ascending=False
)
print(missing_pct.head(15).round(2))

print("\n=== READMISSION DISTRIBUTION ===")
print(df["readmitted"].value_counts(dropna=False))

print("\n=== UNIQUE VALUES IN SELECTED COLUMNS ===")
for column in ["race", "gender", "age", "readmitted"]:
    print(f"\n{column}:")
    print(df[column].value_counts(dropna=False).head(15))


print("\n=== FEATURE AUDIT FOR READMISSION ML ===")

# Columns that identify records, rather than describe patients
id_columns = [
    "encounter_id",
    "patient_nbr",
]

print("\nIdentifier columns:")
for col in id_columns:
    if col in df.columns:
        print(f"- {col}: {df[col].nunique()} unique values")

# Check fields that may only be known near or after discharge
timing_sensitive_columns = [
    "discharge_disposition_id",
    "discharge_destination",
    "discharge_status",
    "discharge_date",
]

print("\nPotentially timing-sensitive columns:")
for col in timing_sensitive_columns:
    if col in df.columns:
        print(f"- {col}: PRESENT")
    else:
        print(f"- {col}: not found")

# In this dataset, missing values may be represented by "?"
print("\nQuestion-mark values by column:")
question_mark_counts = (
    df.astype("string")
      .eq("?")
      .sum()
      .sort_values(ascending=False)
)
print(question_mark_counts[question_mark_counts > 0].head(20))

print("\n=== COLUMNS TO REVIEW ===")
print("Total columns:", len(df.columns))
print("Target column: readmitted")
print("Review each feature's availability at prediction time before training.")

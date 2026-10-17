
import pandas as pd
from pathlib import Path

DATASET_PATH = Path("dataa diabetes/diabetic_data.csv")



df = pd.read_csv(
    DATASET_PATH,
    na_values=["?", ""],
    keep_default_na=False,
    low_memory=False,
)


print("Dataset shape:", df.shape)
print("\nTarget distribution:")
print(df["readmitted"].value_counts(dropna=False))

print("\nAll columns:")
for i, column in enumerate(df.columns, start=1):
    print(f"{i:02d}. {column} ({df[column].dtype})")

print("\nMissing values — top 15:")
print(df.isna().sum().sort_values(ascending=False).head(15))



print("\nFeature cardinality audit:")

for column in df.columns:
    if column == "readmitted":
        continue

    unique_count = df[column].nunique(dropna=True)
    unique_values = df[column].dropna().value_counts().head(5).to_dict()

    if unique_count <= 5:
        print(
            f"{column}: {unique_count} unique values | "
            f"examples: {unique_values}"
        )

print("\nConstant columns:")

constant_columns = [
    column
    for column in df.columns
    if column != "readmitted"
    and df[column].nunique(dropna=False) <= 1
]

print(constant_columns)


print("\nDischarge disposition audit:")

if "discharge_disposition_id" in df.columns:
    print(
        df.groupby("discharge_disposition_id", dropna=False)
        .agg(
            encounters=("readmitted", "size"),
            readmission_classes=("readmitted", "nunique"),
        )
        .sort_values("encounters", ascending=False)
        .to_string()
    )

    print("\nReadmission distribution by discharge disposition:")
    print(
        pd.crosstab(
            df["discharge_disposition_id"],
            df["readmitted"],
            normalize="index",
        )
        .round(3)
        .to_string()
    )


print("\nEligibility audit:")

disposition_labels = {
    11: "Expired",
    13: "Hospice / home",
    14: "Hospice / medical facility",
    19: "Expired / home",
    20: "Expired / medical facility",
    21: "Expired / place unknown",
}

for code, label in disposition_labels.items():
    subset = df[df["discharge_disposition_id"] == code]
    if not subset.empty:
        print(f"\n{code} - {label}: {len(subset)} encounters")
        print(subset["readmitted"].value_counts().to_dict())

death_codes = [11, 19, 20, 21]
hospice_codes = [13, 14]

print("\nTotal encounters:", len(df))
print(
    "Death-related encounters:",
    df["discharge_disposition_id"].isin(death_codes).sum(),
)
print(
    "Hospice-related encounters:",
    df["discharge_disposition_id"].isin(hospice_codes).sum(),
)
print(
    "Encounters after excluding death-related records:",
    (~df["discharge_disposition_id"].isin(death_codes)).sum(),
)
print(
    "Encounters after excluding death and hospice records:",
    (~df["discharge_disposition_id"].isin(
        death_codes + hospice_codes
    )).sum(),
)


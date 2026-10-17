
import pandas as pd
import numpy as np
from pathlib import Path

# Project paths
DATA_PATH = Path("data/processed.cleveland.data")
RESULTS_DIR = Path("results")
RESULTS_DIR.mkdir(exist_ok=True)

# Column names in the Cleveland Heart Disease dataset
columns = [
    "age", "sex", "cp", "trestbps", "chol", "fbs",
    "restecg", "thalach", "exang", "oldpeak",
    "slope", "ca", "thal", "target"
]

# Load the dataset
df = pd.read_csv(
    DATA_PATH,
    header=None,
    names=columns,
    na_values="?"
)

# Our example query: count records where target equals 0
exact_count = int((df["target"] == 0).sum())

# Demonstration of the Laplace mechanism
# For this single count query, sensitivity is 1 under
# a replace-one-record privacy model.
rng = np.random.default_rng(42)
epsilon_values = [0.1, 1.0, 5.0]

results = []

for epsilon in epsilon_values:
    sensitivity = 1
    noise_scale = sensitivity / epsilon

    noise = rng.laplace(loc=0, scale=noise_scale)
    noisy_count = exact_count + noise

    # Counts cannot be below zero or above the dataset size.
    noisy_count = float(np.clip(noisy_count, 0, len(df)))

    results.append({
        "epsilon": epsilon,
        "noise_scale": noise_scale,
        "noisy_count": round(noisy_count, 2)
    })

results_df = pd.DataFrame(results)
output_path = RESULTS_DIR / "differential_privacy_counts.csv"
results_df.to_csv(output_path, index=False)

print("Differential Privacy Experiment")
print("--------------------------------")
print("Dataset records:", len(df))
print("Exact count (local reference only):", exact_count)
print("\nNoisy counts at different epsilon values:")
print(results_df.to_string(index=False))
print("\nResults saved to:", output_path)

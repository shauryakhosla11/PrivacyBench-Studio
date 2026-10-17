"""
PrivacyBench Studio: privacy-versus-utility experiment
======================================================

Compares:
  1. Original Diabetes 130-US Hospitals data (baseline)
  2. K-anonymity-style generalization of age/race/gender (k=5 target)
  3. Label randomized response at selected epsilon values (illustrative local DP)

IMPORTANT PRIVACY LIMITATIONS
- The k-anonymity implementation is a practical prototype, not a formal
  guarantee against every attack. It generalizes age/race/gender and suppresses
  rows whose resulting quasi-identifier combination has fewer than k records.
- Randomized response here privatizes ONLY the binary target label, not the
  complete patient record or feature table. It is not record-level DP for the
  entire dataset. The results must be described accordingly.
- This is a research experiment, not a clinical system.
"""

from __future__ import annotations

import json
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

RANDOM_STATE = 42
K_VALUE = 5
EPSILON_VALUES = [0.5, 1.0, 2.0, 5.0]
TARGET = "readmitted"
GROUP_COL = "patient_nbr"
EXCLUDED = {
    TARGET, "patient_nbr", "encounter_id", "ID", "id",
    "weight", "examide", "citoglipton",
}
DEATH_DISPOSITION_CODES = [11, 19, 20, 21]


def find_dataset() -> Path:
    """Find the Diabetes dataset from common project-root locations."""
    candidates = [
        Path("dataa diabetes/diabetic_data.csv"),
        Path("data/diabetic_data.csv"),
        Path("data/diabetes/diabetic_data.csv"),
        Path("diabetic_data.csv"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    searched = "\n".join(f"  - {p}" for p in candidates)
    raise FileNotFoundError(
        "Could not find diabetic_data.csv. Run this script from the project root "
        "or update DATA_PATH. Checked:\n" + searched
    )


def load_dataset(path: Path) -> tuple[pd.DataFrame, pd.Series | None]:
    df = pd.read_csv(path, na_values=["?"], keep_default_na=True, low_memory=False)
    if TARGET not in df.columns:
        raise ValueError("Dataset must contain the 'readmitted' column.")

    if "discharge_disposition_id" in df.columns:
        disposition = pd.to_numeric(df["discharge_disposition_id"], errors="coerce")
        df = df.loc[~disposition.isin(DEATH_DISPOSITION_CODES)].copy()

    df = df.loc[df[TARGET].astype("string").str.strip().isin(["<30", ">30", "NO"])].copy()
    groups = df[GROUP_COL].copy() if GROUP_COL in df.columns else None
    y = (df[TARGET].astype("string").str.strip() == "<30").astype(int)
    X = df[[c for c in df.columns if c not in EXCLUDED]].copy()
    X = X.reset_index(drop=True)
    y = y.reset_index(drop=True)
    if groups is not None:
        groups = groups.reset_index(drop=True)
    return X, y, groups


def make_split(X: pd.DataFrame, y: pd.Series, groups: pd.Series | None):
    if groups is not None and groups.nunique() > 1:
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_STATE)
        train_idx, test_idx = next(splitter.split(X, y, groups=groups))
        method = "patient_group_split"
    else:
        train_idx, test_idx = train_test_split(
            np.arange(len(X)), test_size=0.2, random_state=RANDOM_STATE, stratify=y
        )
        method = "stratified_random_split"
    return train_idx, test_idx, method


def generalize_quasi_identifiers(X: pd.DataFrame, k: int = K_VALUE):
    """
    Generalize selected quasi-identifiers and suppress rows in groups smaller
    than k. The selected QIs are age, race, and gender when present.
    """
    out = X.copy()
    qis = [c for c in ["age", "race", "gender"] if c in out.columns]

    if "age" in out.columns:
        # Age values are commonly ranges such as [50-60); generalize to decade.
        def age_band(value):
            if pd.isna(value):
                return "Age_Unknown"
            text = str(value).strip()
            import re
            match = re.match(r"\[(\d+)-(\d+)\)", text)
            if match:
                lower = int(match.group(1))
                decade = (lower // 10) * 10
                return f"{decade}-{decade + 19}"
            return "Age_Unknown" if text in {"?", "nan", "None"} else text
        out["age"] = out["age"].map(age_band)

    if "race" in out.columns:
        race = out["race"].astype("string").fillna("Unknown").str.strip()
        # Keep common groups; combine rare categories into Other.
        counts = race.value_counts(dropna=False)
        common = set(counts[counts >= k].index.astype(str))
        out["race"] = race.astype(str).map(lambda v: v if v in common else "Other")

    if "gender" in out.columns:
        out["gender"] = out["gender"].astype("string").fillna("Unknown").astype(str)

    if not qis:
        return out, np.ones(len(out), dtype=bool), {
            "k": k, "quasi_identifiers": [], "rows_suppressed": 0,
            "rows_retained": len(out), "k_min_group_size_after_generalization": None,
        }

    # Use quasi-identifier combinations as equivalence classes.
    keys = out[qis].astype("string").fillna("Unknown").astype(str).agg("|".join, axis=1)
    sizes = keys.value_counts()
    keep = keys.map(sizes).to_numpy() >= k
    min_group = int(keys[keep].map(sizes).min()) if keep.any() else None
    audit = {
        "k": k,
        "quasi_identifiers": qis,
        "rows_suppressed": int((~keep).sum()),
        "rows_retained": int(keep.sum()),
        "k_min_group_size_after_generalization": min_group,
        "note": "Prototype generalization/suppression on age, race, gender only; not a comprehensive anonymity proof.",
    }
    return out, keep, audit


def randomized_response_labels(y: pd.Series, epsilon: float, rng: np.random.Generator):
    """
    Binary randomized response: retain the true bit with probability
    exp(epsilon)/(1+exp(epsilon)); otherwise flip it.
    This is label-level local DP, not full-record differential privacy.
    """
    p_keep = np.exp(epsilon) / (1.0 + np.exp(epsilon))
    keep_true = rng.random(len(y)) < p_keep
    flipped = 1 - y.to_numpy(dtype=int)
    privatized = np.where(keep_true, y.to_numpy(dtype=int), flipped)
    return pd.Series(privatized, index=y.index), p_keep


def build_model(X_train: pd.DataFrame):
    numeric_cols = X_train.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [c for c in X_train.columns if c not in numeric_cols]

    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", min_frequency=20, max_categories=30)),
    ])
    preprocess = ColumnTransformer([
        ("numeric", numeric_pipe, numeric_cols),
        ("categorical", categorical_pipe, categorical_cols),
    ])
    return Pipeline([
        ("preprocess", preprocess),
        ("model", LogisticRegression(
            solver="saga", max_iter=1500, tol=0.001,
            class_weight="balanced", random_state=RANDOM_STATE,
        )),
    ])


def evaluate_variant(name, X, y, train_idx, test_idx, y_train_override=None, privacy=None):
    X_train = X.iloc[train_idx].copy()
    X_test = X.iloc[test_idx].copy()
    y_train = y.iloc[train_idx] if y_train_override is None else y_train_override
    y_test = y.iloc[test_idx]

    if y_train.nunique() < 2 or y_test.nunique() < 2:
        raise ValueError(f"{name}: training or test partition has only one class.")

    model = build_model(X_train)
    start = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(X_train, y_train)
    elapsed = round(time.perf_counter() - start, 2)

    pred = model.predict(X_test)
    prob = model.predict_proba(X_test)[:, 1]
    result = {
        "experiment": name,
        "rows_evaluated": int(len(X)),
        "features": int(X.shape[1]),
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_test, pred)), 4),
        "precision": round(float(precision_score(y_test, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, prob)), 4),
        "pr_auc": round(float(average_precision_score(y_test, prob)), 4),
        "training_seconds": elapsed,
    }
    if privacy:
        result.update(privacy)
    return result


def main():
    data_path = find_dataset()
    results_dir = Path("results")
    results_dir.mkdir(exist_ok=True)

    X, y, groups = load_dataset(data_path)
    train_idx, test_idx, split_method = make_split(X, y, groups)
    print(f"Dataset: {data_path}")
    print(f"Rows: {len(X):,} | Features: {X.shape[1]} | Positive rate: {y.mean():.4f}")
    print(f"Split: {split_method} | Train: {len(train_idx):,} | Test: {len(test_idx):,}")

    results = []

    # Baseline: original features and true labels.
    results.append(evaluate_variant(
        "Original baseline", X, y, train_idx, test_idx,
        privacy={"privacy_method": "none", "epsilon": None, "k": None, "rows_suppressed": 0},
    ))

    # K-anonymity prototype: generalize QIs and suppress rows in small equivalence classes.
    X_k, keep, k_audit = generalize_quasi_identifiers(X, K_VALUE)
    X_k = X_k.loc[keep].reset_index(drop=True)
    y_k = y.loc[keep].reset_index(drop=True)
    groups_k = groups.loc[keep].reset_index(drop=True) if groups is not None else None
    train_k, test_k, split_k = make_split(X_k, y_k, groups_k)
    results.append(evaluate_variant(
        f"K-anonymity prototype (k={K_VALUE})", X_k, y_k, train_k, test_k,
        privacy={
            "privacy_method": "quasi_identifier_generalization_and_suppression",
            "epsilon": None,
            "k": K_VALUE,
            "rows_suppressed": k_audit["rows_suppressed"],
            "rows_retained": k_audit["rows_retained"],
            "split_method": split_k,
        },
    ))

    # Label-level randomized response. Split remains fixed; only training labels
    # are privatized, while test labels stay true for meaningful utility evaluation.
    rng = np.random.default_rng(RANDOM_STATE)
    y_train_true = y.iloc[train_idx].reset_index(drop=True)
    for epsilon in EPSILON_VALUES:
        y_train_private, p_keep = randomized_response_labels(
            y_train_true, epsilon, rng
        )
        results.append(evaluate_variant(
            f"Label randomized response (epsilon={epsilon})",
            X, y, train_idx, test_idx,
            y_train_override=y_train_private,
            privacy={
                "privacy_method": "binary_label_randomized_response_only",
                "epsilon": epsilon,
                "k": None,
                "rows_suppressed": 0,
                "label_keep_probability": round(float(p_keep), 4),
                "split_method": split_method,
                "privacy_scope_warning": "Protects training labels only; not the full patient record/features.",
            },
        ))

    results_df = pd.DataFrame(results)
    metrics_path = results_dir / "privacy_utility_comparison.csv"
    results_df.to_csv(metrics_path, index=False)

    audit = {
        "dataset": str(data_path),
        "rows_after_cleaning": int(len(X)),
        "feature_count": int(X.shape[1]),
        "positive_rate": round(float(y.mean()), 4),
        "split_method": split_method,
        "train_rows": int(len(train_idx)),
        "test_rows": int(len(test_idx)),
        "k_anonymity_audit": k_audit,
        "differential_privacy_scope": (
            "The randomized-response experiments privatize training target labels only. "
            "They do not provide record-level DP for the entire dataset."
        ),
        "model": "LogisticRegression(class_weight='balanced')",
        "random_state": RANDOM_STATE,
    }
    audit_path = results_dir / "privacy_utility_audit.json"
    audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    print("\n=== PRIVACY / UTILITY RESULTS ===")
    display_cols = [
        "experiment", "accuracy", "balanced_accuracy", "precision",
        "recall", "f1", "roc_auc", "pr_auc", "training_seconds",
    ]
    print(results_df[display_cols].to_string(index=False))
    print(f"\nSaved metrics: {metrics_path}")
    print(f"Saved audit:   {audit_path}")
    print("\nInterpretation note: do not describe label randomized response as full-record DP.")


if __name__ == "__main__":
    main()

from io import BytesIO

import time

import warnings



import numpy as np

import pandas as pd

from fastapi import APIRouter, File, HTTPException, UploadFile

from sklearn.compose import ColumnTransformer

from sklearn.dummy import DummyClassifier

from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier

from sklearn.impute import SimpleImputer

from sklearn.linear_model import LogisticRegression

from sklearn.metrics import (

    accuracy_score,

    balanced_accuracy_score,

    average_precision_score,

    classification_report,

    f1_score,

    precision_score,

    recall_score,

    roc_auc_score,

)

from sklearn.model_selection import GroupShuffleSplit, train_test_split

from sklearn.pipeline import Pipeline

from sklearn.preprocessing import OneHotEncoder, StandardScaler



try:

    from catboost import CatBoostClassifier

    CATBOOST_AVAILABLE = True

except ImportError:

    CatBoostClassifier = None

    CATBOOST_AVAILABLE = False





router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024





@router.post("/evaluate")

async def evaluate_models(file: UploadFile = File(...)):

    """Compare models for early readmission within 30 days.



    Positive class: readmitted == '<30'

    Negative class: readmitted == '>30' or 'NO'

    This is a research experiment, not a clinically validated system.

    """

    if not file.filename or not file.filename.lower().endswith(".csv"):

        raise HTTPException(400, "Please upload a CSV file.")



    raw = await file.read(MAX_UPLOAD_BYTES + 1)

    if len(raw) > MAX_UPLOAD_BYTES:

        raise HTTPException(413, "CSV must be 20 MB or smaller.")



    try:

        df = pd.read_csv(

            BytesIO(raw),

            na_values=["?", ""],

            keep_default_na=False,

            low_memory=False,

        )

    except Exception as exc:

        raise HTTPException(400, f"Could not read CSV: {exc}") from exc



    if df.empty:

        raise HTTPException(400, "The uploaded CSV is empty.")

    if "readmitted" not in df.columns:

        raise HTTPException(

            400,

            "This experiment expects the 'readmitted' target column "

            "from the Diabetes 130-US Hospitals dataset.",

        )

    if len(df) < 100:

        raise HTTPException(400, "Please upload at least 100 rows.")



    # Remove encounters where death-related discharge prevents readmission.

    death_codes = [11, 19, 20, 21]

    if "discharge_disposition_id" in df.columns:

        disposition = pd.to_numeric(

            df["discharge_disposition_id"], errors="coerce"

        )

        df = df.loc[~disposition.isin(death_codes)].reset_index(drop=True)



    target = "readmitted"

    group_col = "patient_nbr"

    groups = df[group_col].copy() if group_col in df.columns else None



    excluded = {

        target, "patient_nbr", "encounter_id", "ID", "id",

        "weight", "examide", "citoglipton",

    }

    excluded_present = sorted(c for c in excluded if c in df.columns)

    feature_columns = [c for c in df.columns if c not in excluded]

    if not feature_columns:

        raise HTTPException(400, "No usable predictor columns were found.")



    X = df[feature_columns].copy()

    original_y = df[target].astype("string").str.strip()

    valid = original_y.isin(["<30", ">30", "NO"])

    X = X.loc[valid].reset_index(drop=True)

    original_y = original_y.loc[valid].reset_index(drop=True)

    if groups is not None:

        groups = groups.loc[valid].reset_index(drop=True)



    # Binary target: early readmission vs. no early readmission.

    y = (original_y == "<30").astype(int)

    if len(X) < 100 or y.nunique() < 2:

        raise HTTPException(

            400, "Not enough valid rows or target labels to train a model."

        )



    if groups is not None and groups.nunique() >= 2:

        splitter = GroupShuffleSplit(

            n_splits=1, test_size=0.2, random_state=42

        )

        train_idx, test_idx = next(splitter.split(X, y, groups=groups))

        split_method = "patient_group_split"

    else:

        train_idx, test_idx = train_test_split(

            np.arange(len(X)),

            test_size=0.2,

            random_state=42,

            stratify=y,

        )

        split_method = "stratified_random_split"



    X_train, X_test = X.iloc[train_idx].copy(), X.iloc[test_idx].copy()

    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

    if y_train.nunique() < 2 or y_test.nunique() < 2:

        raise HTTPException(

            400,

            "The split does not contain both target classes. "

            "Try another dataset or revise the grouping strategy.",

        )



    numeric_cols = X_train.select_dtypes(include=["number"]).columns.tolist()

    categorical_cols = [c for c in X_train.columns if c not in numeric_cols]



    # Sklearn models: fit preprocessing on training rows only.

    numeric_pipeline = Pipeline([

        ("imputer", SimpleImputer(strategy="median")),

        ("scaler", StandardScaler()),

    ])

    categorical_pipeline = Pipeline([

        ("imputer", SimpleImputer(strategy="most_frequent")),

        ("encoder", OneHotEncoder(

            handle_unknown="ignore",

            min_frequency=20,

            max_categories=30,

        )),

    ])

    preprocess = ColumnTransformer([

        ("numeric", numeric_pipeline, numeric_cols),

        ("categorical", categorical_pipeline, categorical_cols),

    ])



    models = {

        "Majority Baseline": DummyClassifier(strategy="most_frequent"),

        "Logistic Regression": LogisticRegression(

            solver="saga", max_iter=1500, tol=0.001,

            class_weight="balanced", random_state=42,

        ),

        "Random Forest Balanced": RandomForestClassifier(

            n_estimators=250, min_samples_leaf=2,

            class_weight="balanced_subsample",

            random_state=42, n_jobs=-1,

        ),

        "Extra Trees Balanced": ExtraTreesClassifier(

            n_estimators=250, min_samples_leaf=2,

            class_weight="balanced",

            max_features="sqrt", random_state=42, n_jobs=-1,

        ),

    }



    results = []

    warnings_list = []



    def score_result(name, estimator, predictions, probabilities, elapsed):

        return {

            "model": name,

            "accuracy": round(float(accuracy_score(y_test, predictions)), 4),

            "balanced_accuracy": round(

                float(balanced_accuracy_score(y_test, predictions)), 4

            ),

            "precision": round(float(

                precision_score(y_test, predictions, zero_division=0)

            ), 4),

            "recall": round(float(

                recall_score(y_test, predictions, zero_division=0)

            ), 4),

            "f1": round(float(f1_score(

                y_test, predictions, zero_division=0

            )), 4),

            "roc_auc": round(float(roc_auc_score(

                y_test, probabilities

            )), 4) if probabilities is not None else None,

            "pr_auc": round(float(average_precision_score(

                y_test, probabilities

            )), 4) if probabilities is not None else None,

            "training_seconds": elapsed,

            "classification_report": classification_report(

                y_test, predictions, labels=[0, 1],

                target_names=["not_readmitted_within_30_days", "readmitted_within_30_days"],

                output_dict=True, zero_division=0,

            ),

        }



    for name, estimator in models.items():

        pipeline = Pipeline([

            ("preprocess", preprocess),

            ("model", estimator),

        ])

        started = time.perf_counter()

        try:

            with warnings.catch_warnings(record=True) as caught:

                warnings.simplefilter("always")

                pipeline.fit(X_train, y_train)

                predictions = pipeline.predict(X_test)

                probabilities = (

                    pipeline.predict_proba(X_test)[:, 1]

                    if hasattr(pipeline, "predict_proba") else None

                )

            elapsed = round(time.perf_counter() - started, 2)

            results.append(score_result(

                name, pipeline, predictions, probabilities, elapsed

            ))

            warnings_list.extend(f"{name}: {w.message}" for w in caught)

        except Exception as exc:

            warnings_list.append(f"{name} failed: {type(exc).__name__}: {exc}")



    # CatBoost handles categorical columns natively; no one-hot encoding.

    if CATBOOST_AVAILABLE:

        try:

            cat_train = X_train.copy()

            cat_test = X_test.copy()

            cat_cols = []

            for col in categorical_cols:

                cat_cols.append(col)

                cat_train[col] = cat_train[col].astype("string").fillna("__MISSING__").astype(str)

                cat_test[col] = cat_test[col].astype("string").fillna("__MISSING__").astype(str)

            for col in numeric_cols:

                med = pd.to_numeric(cat_train[col], errors="coerce").median()

                if pd.isna(med):

                    med = 0

                cat_train[col] = pd.to_numeric(cat_train[col], errors="coerce").fillna(med)

                cat_test[col] = pd.to_numeric(cat_test[col], errors="coerce").fillna(med)



            started = time.perf_counter()

            cat_model = CatBoostClassifier(

                iterations=900,

                depth=7,

                learning_rate=0.05,

                loss_function="Logloss",

                eval_metric="AUC",

                auto_class_weights="Balanced",

                random_seed=42,

                verbose=False,

                allow_writing_files=False,

                thread_count=-1,

            )

            # Select a decision threshold using training data only. The final test
            # set remains untouched until the threshold has been selected.
            if groups is not None and groups.nunique() >= 3:
                train_groups = groups.iloc[train_idx].reset_index(drop=True)
                inner_splitter = GroupShuffleSplit(
                    n_splits=1, test_size=0.2, random_state=43
                )
                fit_rel, val_rel = next(
                    inner_splitter.split(X_train, y_train, groups=train_groups)
                )
            else:
                fit_rel, val_rel = train_test_split(
                    np.arange(len(X_train)), test_size=0.2, random_state=43,
                    stratify=y_train
                )

            X_fit, X_val = X_train.iloc[fit_rel].copy(), X_train.iloc[val_rel].copy()
            y_fit, y_val = y_train.iloc[fit_rel], y_train.iloc[val_rel]

            def prepare_catboost(frame, reference):
                prepared = frame.copy()
                for column in categorical_cols:
                    prepared[column] = prepared[column].astype("string").fillna("__MISSING__").astype(str)
                for column in numeric_cols:
                    median = pd.to_numeric(reference[column], errors="coerce").median()
                    if pd.isna(median):
                        median = 0
                    prepared[column] = pd.to_numeric(prepared[column], errors="coerce").fillna(median)
                return prepared

            cat_fit = prepare_catboost(X_fit, X_fit)
            cat_val = prepare_catboost(X_val, X_fit)
            cat_test = prepare_catboost(X_test, X_train)

            started = time.perf_counter()
            cat_model = CatBoostClassifier(
                iterations=900,
                depth=7,
                learning_rate=0.05,
                loss_function="Logloss",
                eval_metric="AUC",
                auto_class_weights="Balanced",
                random_seed=42,
                verbose=False,
                allow_writing_files=False,
                thread_count=-1,
            )
            cat_model.fit(cat_fit, y_fit, cat_features=cat_cols)
            val_probabilities = cat_model.predict_proba(cat_val)[:, 1]

            # Maximize validation F1 over a practical threshold range.
            threshold_candidates = np.arange(0.10, 0.701, 0.01)
            threshold_scores = [
                f1_score(y_val, (val_probabilities >= threshold).astype(int), zero_division=0)
                for threshold in threshold_candidates
            ]
            best_index = int(np.argmax(threshold_scores))
            best_threshold = float(threshold_candidates[best_index])

            # Refit on the full training set and evaluate once on held-out test data.
            cat_train_full = prepare_catboost(X_train, X_train)
            cat_test = prepare_catboost(X_test, X_train)
            cat_model.fit(cat_train_full, y_train, cat_features=cat_cols)
            probabilities = cat_model.predict_proba(cat_test)[:, 1]
            predictions = (probabilities >= best_threshold).astype(int)
            elapsed = round(time.perf_counter() - started, 2)
            cat_result = score_result(
                "CatBoost Balanced", cat_model, predictions, probabilities, elapsed
            )
            cat_result["decision_threshold"] = round(best_threshold, 3)
            cat_result["validation_f1_at_threshold"] = round(float(threshold_scores[best_index]), 4)
            results.append(cat_result)

        except Exception as exc:

            warnings_list.append(

                f"CatBoost failed: {type(exc).__name__}: {exc}"

            )

    else:

        warnings_list.append(

            "CatBoost is not installed in the backend environment. "

            "Run: python -m pip install catboost"

        )



    if not results:

        raise HTTPException(

            500,

            "All models failed. Check backend logs. " + " | ".join(warnings_list[:3]),

        )



    # Rank by PR-AUC (better reflects rare positive-class performance).

    results.sort(

        key=lambda result: (

            result["pr_auc"] if result["pr_auc"] is not None else -1

        ),

        reverse=True,

    )



    positive_rate = round(float(y_test.mean()), 4)

    return {

        "target": "early_readmission_within_30_days",

        "task": "binary_classification",

        "positive_class": "readmitted == '<30'",

        "negative_class": "readmitted in ['>30', 'NO']",

        "rows_used": len(X),

        "features_used": len(X.columns),

        "train_rows": len(X_train),

        "test_rows": len(X_test),

        "split_method": split_method,

        "classes": [0, 1],

        "test_positive_rate": positive_rate,

        "best_model_by_pr_auc": results[0]["model"],

        "feature_audit": {

            "excluded_columns": excluded_present,

            "predictor_columns": X.columns.tolist(),

            "numeric_features": numeric_cols,

            "categorical_features": categorical_cols,

            "patient_identifier_used_for_grouping": (

                group_col if groups is not None else None

            ),

        },

        "results": results,

        "warnings": warnings_list[:10],

        "note": (

            "CatBoost threshold is selected on training validation data, not the test set. "
            "Accuracy alone can be misleading because early readmission is "

            "the minority class. Compare recall, F1, balanced accuracy, ROC-AUC, "

            "and PR-AUC; the majority baseline is included for context. "

            "This is a research baseline, not a clinically validated system. "

            "Predictor suitability depends on the intended prediction time."

        ),

    }

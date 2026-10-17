# PrivacyBench Studio

### Exploring the Trade-off Between Data Privacy and Machine Learning Utility

PrivacyBench Studio is a healthcare data privacy analysis and benchmarking project designed to explore how privacy-preserving techniques affect the usefulness of data for analysis and machine learning.

Healthcare datasets can help researchers develop predictive models, identify patterns, and investigate clinical outcomes. However, these datasets can also contain sensitive information. Protecting privacy while preserving the analytical value of data is therefore an important challenge.

**PrivacyBench Studio aims to make this trade-off easier to understand, experiment with, and evaluate.**

The project combines a web-based interface, a Python backend, healthcare dataset analysis, and privacy research experiments. Its longer-term goal is to provide a unified environment for comparing privacy protection techniques and understanding their impact on downstream machine learning tasks.

> **Project status:** Active development. This repository contains the current application code and research scripts. Some capabilities described in the roadmap are planned improvements rather than completed features.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Proposed Solution](#the-proposed-solution)
- [Current Work](#current-work)
- [Privacy Techniques Under Investigation](#privacy-techniques-under-investigation)
- [Privacy vs. Utility](#privacy-vs-utility)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Datasets and Research](#datasets-and-research)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Research Limitations](#research-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

---

## The Problem

Machine learning research often depends on access to large datasets. In healthcare, these datasets can contain information about patient demographics, diagnoses, treatments, and hospital visits.

Making data available for research creates several challenges:

- **Privacy risks:** Individual records may reveal sensitive information.
- **Re-identification:** A person may be identifiable when seemingly harmless attributes are combined with other information.
- **Information disclosure:** Even when direct identifiers are removed, sensitive attributes may remain exposed.
- **Reduced data utility:** Generalizing, suppressing, or perturbing data can affect the quality of downstream analysis.
- **Difficult comparisons:** Different privacy techniques offer different protections and can affect machine learning performance in different ways.

Removing names and obvious identifiers alone does not guarantee that a dataset is anonymous.

The central question behind this project is:

**How can we evaluate the relationship between data privacy protection and the usefulness of healthcare data for machine learning?**

---

## The Proposed Solution

PrivacyBench Studio is being developed as an experimental platform for healthcare data analysis and privacy benchmarking.

The project brings together three main areas:

1. **Dataset analysis:** Inspect datasets, understand their structure, and examine missing values and feature distributions.
2. **Privacy experimentation:** Investigate techniques such as k-anonymity, l-diversity, and differential privacy.
3. **Machine learning utility:** Explore how privacy-related transformations affect the performance of downstream predictive models.

The intended workflow is to analyze a dataset, apply or configure a privacy technique, evaluate the resulting privacy properties, and compare analytical or predictive performance.

The long-term goal is to make these experiments easier to reproduce and compare through a single interface.

---

## Current Work

### 1. Healthcare Dataset Profiling

The project includes a backend endpoint for dataset profiling and a frontend interface for presenting dataset information.

The current profiling workflow has been tested with the Diabetes 130-US Hospitals dataset, which contains 101,766 records and 50 columns in the version used during development.

The project has also examined missing values and dataset structure to support subsequent experiments.

### 2. K-Anonymity Experiments

K-anonymity experiments investigate whether records can be distinguished using selected quasi-identifying attributes.

The research scripts explore age generalization and grouping records by attributes such as age group and sex. They examine group sizes and identify groups that do not meet a chosen value of *k*.

### 3. L-Diversity Experiments

L-diversity experiments investigate the diversity of sensitive attribute values within groups formed from quasi-identifiers.

The existing research scripts examine diagnosis-category diversity and identify groups that fail a chosen diversity threshold.

### 4. Differential Privacy Experiments

The project includes a Python script for experimenting with differential privacy.

The initial experiments compare exact counts against noisy counts produced under different privacy-budget settings, including epsilon values of 0.1, 1.0, and 5.0.

These experiments are intended to demonstrate how the privacy budget influences the amount of noise introduced into a statistical result.

### 5. Privacy and Machine Learning Utility

The project also includes privacy–utility experiment scripts and a machine learning backend module.

The broader research direction is to compare data protection approaches with downstream model performance, helping investigate how privacy-related changes can affect predictive utility.

The exact evaluation metrics and supported experimental configurations will evolve as the benchmarking workflow is developed.

---

## Privacy Techniques Under Investigation

| Technique            | Purpose                                                                                                         | Main consideration                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| K-anonymity          | Makes records indistinguishable from at least *k − 1* other records with respect to selected quasi-identifiers. | Can be vulnerable to attribute disclosure and background-knowledge attacks.       |
| L-diversity          | Requires diversity in sensitive attribute values within equivalence classes.                                    | Diversity alone does not eliminate every disclosure risk.                         |
| Differential privacy | Provides a mathematical privacy guarantee for appropriately designed randomized analyses.                       | Results depend on the mechanism, privacy budget, composition, and implementation. |
| Generalization       | Replaces specific values with broader categories, such as age bands.                                            | Reduces detail and may affect analytical usefulness.                              |
| Suppression          | Removes selected values or records from an analysis or release.                                                 | Can reduce dataset coverage and introduce bias.                                   |

These methods provide different types of protection and should not be treated as interchangeable. The project investigates their properties and potential trade-offs.

---

## Privacy vs. Utility

An important direction for PrivacyBench Studio is the systematic evaluation of **privacy–utility trade-offs**.

Privacy and utility represent different objectives:

- **Privacy:** How effectively does a method limit the disclosure of sensitive information under its stated assumptions?
- **Utility:** How useful does the resulting data remain for statistical analysis or machine learning?

For example, a transformation that generalizes ages into broader ranges may reduce the specificity of individual records, but it can also remove predictive information.

A useful benchmark should therefore examine more than one number. Depending on the technique and experiment, evaluations may include:

- Group-size and anonymity checks.
- Sensitive-attribute diversity.
- Statistical differences between original and transformed data.
- Classification performance using metrics such as precision, recall, F1-score, and ROC-AUC where appropriate.
- The effect of different privacy settings on predictive utility.

These evaluations need to be interpreted in context. Classification performance alone is not a measure of privacy, and a technique should not be described as safe merely because it produces good model scores.

---

## Technology Stack

### Frontend

- **React** — component-based user interface.
- **Vite** — frontend development server and build tooling.
- **JavaScript and CSS** — application logic, styling, and interactive presentation.

### Backend

- **Python** — research experiments and backend logic.
- **FastAPI** — HTTP API for communication with the frontend.
- **Pandas** — data loading, transformation, and analysis.
- **Scikit-learn** — machine learning utilities and evaluation workflows where used.

### Development Tools

- **Git and GitHub** — version control and source-code hosting.
- **Visual Studio Code** — development environment.
- **Jupyter and Python scripts** — experimentation and data analysis.

The precise dependency versions should be documented in the project's dependency files as they are standardized.

---

## System Architecture

PrivacyBench Studio follows a frontend–backend architecture.

```text
                 User
                  |
                  v
       +----------------------+
       |   React Frontend     |
       |      + Vite          |
       +----------------------+
                  |
             HTTP / API
                  |
                  v
       +----------------------+
       |    FastAPI Backend   |
       +----------------------+
                  |
          +-------+--------+
          |                |
          v                v
   Dataset Profiling   ML and Privacy
                       Experiment Logic
          |                |
          +-------+--------+
                  |
                  v
        Analysis and Results
```

The frontend provides the user-facing experience. The backend handles API requests and connects the interface to the Python analysis logic.

The research scripts provide a separate environment for running and investigating privacy experiments. As development progresses, the aim is to integrate more of these workflows into a consistent benchmarking experience.

---

## Datasets and Research

The project has explored multiple healthcare datasets during development.

### Diabetes 130-US Hospitals Dataset

The project has used a version of this dataset containing 101,766 records and 50 columns.

A machine learning experiment has investigated the `readmitted` target, with the classes:

- `<30` — readmission within 30 days.
- `>30` — readmission after 30 days.
- `NO` — no recorded readmission under the dataset's target definition.

One experiment used 47 features and a patient-group-based train/test split. Keeping patient groups separate between training and test data helps reduce leakage caused by multiple records belonging to the same patient.

The dataset's original documentation should be consulted for its precise clinical definitions, coding, and limitations.

### UCI Heart Disease Dataset

Earlier privacy experiments used the Cleveland Heart Disease dataset to investigate age generalization, k-anonymity, and l-diversity.

These experiments form part of the project's research history and are separate from the newer, larger diabetes readmission workflow.

### Data Availability

Healthcare datasets are not included in the repository by default. Users should obtain them from their original sources and follow the applicable access conditions, licences, and data-use restrictions.

The project should not be used to upload or publish identifiable patient records.

---

## Project Structure

```text
PrivacyBench-Studio/
|
|-- backend/
|   |-- main.py
|   |-- audit_features.py
|   |-- ml.py
|
|-- frontend/
|   |-- public/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- App.css
|   |   |-- HeroScene.jsx
|   |   |-- Slides.jsx
|   |   |-- Stage3D.jsx
|   |   |-- index.css
|   |   |-- main.jsx
|   |-- package.json
|   |-- package-lock.json
|
|-- differential_privacy.py
|-- inspect_dataset.py
|-- privacy_utility_experiment.py
|-- privacy_utility_experiment_v2.py
|-- .gitignore
|-- README.md
```

**Note:** This tree describes the main tracked application and research files. Local datasets, generated results, and virtual environments may exist outside the repository.

---

## Getting Started

### Prerequisites

Install the following tools:

- Python 3.10 or a compatible version supported by the backend dependencies.
- Node.js and npm.
- Git.

The commands below assume that you have cloned the repository and are working from its root directory.

### 1. Clone the Repository

```bash
git clone https://github.com/shauryakhosla11/PrivacyBench-Studio.git
cd PrivacyBench-Studio
```

### 2. Set Up the Python Environment

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies required by the current code. For example, the application uses FastAPI, Uvicorn, pandas, and scikit-learn; additional packages may be required by individual modules.

```powershell
python -m pip install fastapi uvicorn pandas scikit-learn
```

Once a backend `requirements.txt` is maintained, prefer installing from that file so the environment is reproducible.

### 3. Start the Backend

From the repository root:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The API should be available at:

- API base URL: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

Keep this terminal running.

### 4. Start the Frontend

Open a second terminal and move to the frontend directory:

```powershell
cd frontend
npm install
npm run dev
```

Vite will print the local development URL, typically:

`http://localhost:5173`

Open that URL in your browser.

### Dataset Requirements

Some research scripts require local dataset files that are not included in the repository. Review the relevant script before running it and obtain the required data from its original source.

The application and research scripts may have different dataset requirements; a successful frontend startup does not necessarily mean every experiment can run without additional data.

---

## Research Limitations

PrivacyBench Studio is an experimental research and software-development project, not a certified healthcare privacy solution.

Important limitations include:

- K-anonymity and l-diversity provide specific protections but do not guarantee privacy against every attack.
- Differential privacy guarantees depend on the implemented mechanism, assumptions, and privacy accounting.
- Machine learning utility depends on the dataset, target, preprocessing, train/test strategy, and evaluation methodology.
- Results from one dataset do not automatically generalize to other healthcare settings.
- The current experiments should not be interpreted as evidence of regulatory compliance or as a substitute for a formal privacy risk assessment.

A future benchmarking release should document experiment configurations, random seeds where applicable, assumptions, metrics, and reproducibility details.

---

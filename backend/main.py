from backend.ml import router as ml_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PrivacyBench Studio API",
    description="Healthcare data privacy and ML evaluation platform",
    version="0.1.0",
)

app.include_router(ml_router)
# Allow the React development server to communicate with FastAPI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Welcome to PrivacyBench Studio",
        "status": "running",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "PrivacyBench Studio API",
    }


from io import BytesIO

import pandas as pd
from fastapi import File, HTTPException, UploadFile


@app.post("/api/dataset/profile")
async def profile_dataset(file: UploadFile = File(...)):
    # Accept CSV files only.
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a .csv file.",
        )

    # Read the upload into memory, with a size limit of 20 MB.
    content = await file.read(20 * 1024 * 1024 + 1)

    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 20 MB upload limit.",
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    try:
        df = pd.read_csv(BytesIO(content), na_values=["?", ""])
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read this CSV: {exc}",
        ) from exc

    if df.empty or len(df.columns) == 0:
        raise HTTPException(
            status_code=400,
            detail="The CSV contains no data rows or columns.",
        )

    missing = df.isna().sum()

    return {
        "filename": file.filename,
        "rows": len(df),
        "columns_count": len(df.columns),
        "columns": [
            {
                "name": str(column),
                "dtype": str(df[column].dtype),
                "missing_count": int(missing[column]),
                "missing_percent": round(
                    float(missing[column] / len(df) * 100), 2
                ),
            }
            for column in df.columns
        ],
        "preview": df.head(5).fillna("").astype(str).to_dict(
            orient="records"
        ),
        "note": "Preview data is returned only for this request; uploads are not saved to disk.",
    }

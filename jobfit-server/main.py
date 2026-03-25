from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import AsyncGroq
import fitz  # PyMuPDF
import os
import json
from dotenv import load_dotenv

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))


class AnalyzeRequest(BaseModel):
    job_description: str
    resume_text: str


@app.get("/")
def root():
    return {"status": "CareerFit AI API is running"}


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    content = await file.read()
    doc = fitz.open(stream=content, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    doc.close()
    return {"resume_text": text.strip()}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    system_prompt = """You are an expert career coach and professional 
    resume writer with 15 years of experience. You give specific, 
    actionable, honest feedback. Always return valid JSON only."""

    user_message = f"""
    Analyze this job application and return ONLY a valid JSON object.
    No extra text before or after. No markdown. Just the JSON.

    JOB DESCRIPTION:
    ---
    {req.job_description}
    ---

    MY RESUME:
    ---
    {req.resume_text}
    ---

    Return this exact JSON structure:
    {{
      "match_score": <number 0-100>,
      "matched_skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
      "missing_skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
      "resume_improvements": [
        {{
          "original": "original bullet point from resume",
          "improved": "rewritten stronger version"
        }},
        {{
          "original": "original bullet point from resume",
          "improved": "rewritten stronger version"
        }}
      ],
      "cover_letter": "full cover letter text here",
      "interview_questions": [
        {{
          "question": "interview question here",
          "tip": "how to answer this question"
        }},
        {{
          "question": "interview question here",
          "tip": "how to answer this question"
        }},
        {{
          "question": "interview question here",
          "tip": "how to answer this question"
        }}
      ]
    }}
    """

    response = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        max_tokens=1500,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    )

    raw = response.choices[0].message.content
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {raw[:200]}")

    return data
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

class AnalyzeRequest(BaseModel):
    job_description: str
    resume_text: str

@app.get("/")
def root():
    return {"status": "CareerFit AI API is running"}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    system_prompt = """You are an expert career coach and professional 
    resume writer with 15 years of experience helping candidates land 
    jobs at top companies. You give specific, actionable, honest feedback.
    Never be vague. Always be direct and helpful."""

    user_message = f"""
    Analyze my job application fit.
    
    JOB DESCRIPTION:
    ---
    {req.job_description}
    ---
    
    MY RESUME:
    ---
    {req.resume_text}
    ---
    
    Give me:
    1. A match score out of 100
    2. Top 5 skills from the job description that appear in my resume
    3. Top 5 skills from the job description MISSING from my resume
    4. 2 specific suggestions to improve my resume for this role
    
    Be specific. Reference actual content from both documents.
    """

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": user_message
            }
        ]
    )

    return {
        "result": message.content[0].text,
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens
    }
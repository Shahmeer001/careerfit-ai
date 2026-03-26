from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import pdfplumber
import io
import os
import json
import stripe
from supabase import create_client
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize all clients
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


class AnalyzeRequest(BaseModel):
    job_description: str
    resume_text: str


class CheckoutRequest(BaseModel):
    user_id: str
    email: str


# Helper — get user from token sent by frontend
def get_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    user = supabase.auth.get_user(token)
    if not user or not user.user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user.user


# Helper — check if user is pro
def is_pro(user_id: str) -> bool:
    result = supabase.table("profiles").select("is_pro").eq("id", user_id).execute()
    if result.data:
        return result.data[0]["is_pro"]
    return False


# Helper — check and increment usage for free users
def check_usage(user_id: str) -> bool:
    result = supabase.table("usage").select("*").eq("user_id", user_id).execute()
    if not result.data:
        supabase.table("usage").insert({"user_id": user_id, "count": 1}).execute()
        return True
    count = result.data[0]["count"]
    if count >= 2:
        return False
    supabase.table("usage").update({"count": count + 1}).eq("user_id", user_id).execute()
    return True


@app.get("/")
def root():
    return {"status": "CareerFit AI API is running"}


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    content = await file.read()
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        text = ""
        for page in pdf.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
    return {"resume_text": text.strip()}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest, authorization: Optional[str] = Header(None)):
    # Get user from token
    user = get_user(authorization)
    user_id = user.id

    # Check if pro or within free limit
    if not is_pro(user_id):
        allowed = check_usage(user_id)
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="Free limit reached. Please upgrade to Pro."
            )

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

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=3000,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    )

    raw = completion.choices[0].message.content
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(raw)
    return data


# Create Stripe checkout session
@app.post("/create-checkout")
async def create_checkout(req: CheckoutRequest):
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{
            "price": os.getenv("STRIPE_PRICE_ID"),
            "quantity": 1,
        }],
        customer_email=req.email,
        success_url=f"{os.getenv('FRONTEND_URL')}/success",
        cancel_url=f"{os.getenv('FRONTEND_URL')}/",
        metadata={"user_id": req.user_id}
    )
    return {"checkout_url": session.url}


# Stripe webhook — called by Stripe when payment succeeds
@app.post("/webhook")
async def webhook(request: Request):
    payload = await request.body()
    event = stripe.Event.construct_from(
        json.loads(payload), stripe.api_key
    )

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session["metadata"]["user_id"]
        # Upgrade user to pro in Supabase
        supabase.table("profiles").update(
            {"is_pro": True}
        ).eq("id", user_id).execute()

    return {"status": "ok"}
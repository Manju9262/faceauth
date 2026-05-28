import os
import base64
import hashlib
import uuid
import logging
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
import jwt

import backend.config as config
import backend.database as db
import backend.face_utils as face_utils

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="ZepIris Attendance System API", version="1.0.0")

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to Netlify URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folder for local uploaded files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Database startup hook
@app.on_event("startup")
def startup_db_client():
    db.init_db()

# Password Hashing Helpers
def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return f"{salt}${hashed}"

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, hashed = hashed_password.split("$")
        test_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
        return test_hash == hashed
    except Exception:
        return False

# JWT Helpers
def create_jwt_token(data: dict, expires_delta: timedelta = timedelta(days=7)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, config.JWT_SECRET, algorithm="HS256")

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token is missing or malformed"
        )
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired"
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token"
        )

# Request DTOs
class EmployeeRegisterDTO(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=6)
    selfie: str # Base64 Image string

class LoginDTO(BaseModel):
    email: EmailStr
    password: str
    role: str = Field(..., pattern="^(employee|admin)$")

class MarkAttendanceDTO(BaseModel):
    selfie: str # Base64 Image string
    device_info: Optional[str] = "Web Browser"

class ThresholdUpdateDTO(BaseModel):
    threshold: float = Field(..., ge=0.0, le=1.0)


@app.get("/api/diagnostics")
def run_diagnostics():
    status_info = {
        "status": "success",
        "supabase_configured": bool(config.SUPABASE_URL and config.SUPABASE_KEY),
        "use_supabase": db.USE_SUPABASE,
        "db_type": db.get_db_type(),
        "errors": []
    }
    
    # Test settings table
    try:
        if db.USE_SUPABASE:
            db.supabase_client.table("system_settings").select("key").limit(1).execute()
        else:
            conn = db.get_db_connection()
            conn.execute("SELECT key FROM system_settings LIMIT 1")
            conn.close()
        status_info["system_settings_table"] = "OK"
    except Exception as e:
        status_info["system_settings_table"] = "Error"
        status_info["errors"].append(f"system_settings: {str(e)}")
        
    # Test employees table
    try:
        if db.USE_SUPABASE:
            db.supabase_client.table("employees").select("id").limit(1).execute()
        else:
            conn = db.get_db_connection()
            conn.execute("SELECT id FROM employees LIMIT 1")
            conn.close()
        status_info["employees_table"] = "OK"
    except Exception as e:
        status_info["employees_table"] = "Error"
        status_info["errors"].append(f"employees: {str(e)}")
        
    # Test attendance_logs table
    try:
        if db.USE_SUPABASE:
            db.supabase_client.table("attendance_logs").select("id").limit(1).execute()
        else:
            conn = db.get_db_connection()
            conn.execute("SELECT id FROM attendance_logs LIMIT 1")
            conn.close()
        status_info["attendance_logs_table"] = "OK"
    except Exception as e:
        status_info["attendance_logs_table"] = "Error"
        status_info["errors"].append(f"attendance_logs: {str(e)}")
        
    return status_info

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register-employee")
def register_employee(data: EmployeeRegisterDTO):
    logger.info(f"Received registration request for: {data.email}")
    
    # Check if employee already exists
    existing = db.get_employee_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists.")
    
    # Process selfie and extract embedding
    try:
        img = face_utils.decode_base64_image(data.selfie)
        embedding, face_info = face_utils.extract_face_embedding(img)
    except ValueError as val_err:
        logger.warning(f"Registration face validation failed: {val_err}")
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(f"Image processing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process registration image. Please ensure proper face framing.")

    # Save selfie to Supabase Storage or Local Storage
    try:
        # Convert base64 to binary bytes for uploading
        base64_data = data.selfie
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        img_bytes = base64.b64decode(base64_data)
        
        filename = f"register_{data.email.replace('@', '_').replace('.', '_')}.jpg"
        selfie_url = db.save_selfie(filename, img_bytes)
    except Exception as save_err:
        logger.error(f"Failed to save selfie image: {save_err}")
        raise HTTPException(status_code=500, detail="Failed to save selfie image storage.")

    # Hash Password and save employee records
    pwd_hash = hash_password(data.password)
    try:
        employee = db.create_employee(
            name=data.name,
            email=data.email,
            password_hash=pwd_hash,
            selfie_url=selfie_url,
            embedding=embedding
        )
        return {
            "status": "success",
            "message": "Employee registered successfully",
            "employee": {
                "id": employee["id"],
                "name": employee["name"],
                "email": employee["email"],
                "selfie_url": employee["selfie_url"]
            }
        }
    except Exception as e:
        logger.error(f"Database insertion failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to write employee to database.")

@app.post("/api/auth/login")
def login(data: LoginDTO):
    logger.info(f"Login request for: {data.email} with role: {data.role}")
    
    if data.role == "admin":
        user = db.get_admin_by_email(data.email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        
        if not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
            
        token = create_jwt_token({
            "sub": user["id"],
            "email": user["email"],
            "role": "admin"
        })
        
        return {
            "status": "success",
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "role": "admin"
            }
        }
    else:
        user = db.get_employee_by_email(data.email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
            
        if not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
            
        token = create_jwt_token({
            "sub": user["id"],
            "email": user["email"],
            "role": "employee"
        })
        
        return {
            "status": "success",
            "token": token,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "selfie_url": user["selfie_url"],
                "role": "employee"
            }
        }


# --- ATTENDANCE ENDPOINTS ---

@app.post("/api/attendance/mark")
def mark_attendance(data: MarkAttendanceDTO, current_user: dict = Depends(get_current_user)):
    # Verify employee permissions
    if current_user["role"] != "employee":
        raise HTTPException(status_code=403, detail="Only employees can mark attendance.")
        
    employee_id = current_user["sub"]
    logger.info(f"Marking attendance for employee: {employee_id}")
    
    # Determine the action type (Check In vs Check Out) based on current successes count today
    today_str = date.today().isoformat()
    all_logs = db.get_attendance_logs(employee_id=employee_id, limit=30)
    successes_today = [l for l in all_logs if l["status"] == "success" and l["timestamp"].startswith(today_str)]
    action_type = "Check Out" if len(successes_today) % 2 == 1 else "Check In"
    
    # 1. Process and validate the captured image
    try:
        captured_img = face_utils.decode_base64_image(data.selfie)
        captured_embedding, face_info = face_utils.extract_face_embedding(captured_img)
    except ValueError as val_err:
        logger.warning(f"Attendance face validation failed: {val_err}")
        # Log failed attempt
        db.log_attendance(
            employee_id=employee_id,
            status="failed",
            similarity_score=0.0,
            confidence_score=0.0,
            selfie_url="",
            action=action_type
        )
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(f"Image processing error: {e}")
        db.log_attendance(
            employee_id=employee_id,
            status="failed",
            similarity_score=0.0,
            confidence_score=0.0,
            selfie_url="",
            action=action_type
        )
        raise HTTPException(status_code=500, detail="Failed to process image.")

    # 2. Save captured selfie to storage
    try:
        base64_data = data.selfie
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        img_bytes = base64.b64decode(base64_data)
        
        filename = f"verify_{employee_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jpg"
        captured_selfie_url = db.save_selfie(filename, img_bytes)
    except Exception as save_err:
        logger.error(f"Failed to save verification selfie: {save_err}")
        captured_selfie_url = ""

    # 3. Retrieve stored embedding
    stored_embedding = db.get_employee_embedding(employee_id)
    if not stored_embedding:
        raise HTTPException(status_code=404, detail="Employee face profile embedding not found. Please re-register.")

    # 4. Compare embeddings
    similarity_score = face_utils.compute_cosine_similarity(captured_embedding, stored_embedding)
    
    # Fetch similarity threshold from settings (db)
    threshold_str = db.get_system_setting("similarity_threshold", str(config.DEFAULT_THRESHOLD))
    threshold = float(threshold_str)
    
    # Match decision
    is_match = similarity_score >= threshold
    status_label = "success" if is_match else "failed"
    
    # Save attendance log
    db.log_attendance(
        employee_id=employee_id,
        status=status_label,
        similarity_score=similarity_score,
        confidence_score=similarity_score, # For Cosine, they are equivalent
        selfie_url=captured_selfie_url,
        action=action_type
    )
    
    if is_match:
        return {
            "status": "success",
            "message": f"Attendance marked successfully! Action: {action_type}",
            "similarity_score": similarity_score,
            "threshold": threshold
        }
    else:
        logger.warning(f"Face verification failed: Score {similarity_score:.4f} < Threshold {threshold:.4f}")
        raise HTTPException(
            status_code=400,
            detail=f"Face verification failed. Similarity ({similarity_score:.2f}) was below threshold ({threshold:.2f})."
        )


# --- EMPLOYEE DASHBOARD ENDPOINTS ---

def calculate_active_hours_today(success_logs_today: list) -> float:
    """
    Calculates active hours today from a list of success logs for an employee today.
    The list must be sorted oldest to newest.
    """
    total_seconds = 0.0
    start_time = None
    
    # Process sequential pairs
    for i, log in enumerate(success_logs_today):
        ts_str = log["timestamp"].replace("Z", "")
        try:
            log_time = datetime.fromisoformat(ts_str)
        except Exception:
            continue
            
        is_checkin = (i % 2 == 0) # 1st is checkin, 2nd checkout, etc.
        
        if is_checkin:
            start_time = log_time
        else:
            if start_time:
                total_seconds += (log_time - start_time).total_seconds()
                start_time = None
                
    # If the user is currently checked in, calculate time up to current time (naive UTC)
    if start_time:
        now = datetime.utcnow()
        if now > start_time:
            total_seconds += (now - start_time).total_seconds()
            
    return round(total_seconds / 3600.0, 2)


@app.get("/api/employee/dashboard")
def get_employee_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "employee":
        raise HTTPException(status_code=403, detail="Only employees can access this dashboard.")
        
    employee_id = current_user["sub"]
    employee = db.get_employee_by_email(current_user["email"])
    if not employee:
         raise HTTPException(status_code=404, detail="Employee record not found")
         
    logs = db.get_attendance_logs(employee_id=employee_id, limit=30)
    
    # Compute shift status for today (allowing multiple toggles)
    today = date.today().isoformat()
    success_logs_today = [log for log in logs if log["status"] == "success" and log["timestamp"].startswith(today)]
    
    # success_logs_today is fetched newest first, we reverse it to get oldest first
    success_logs_today_ordered = list(success_logs_today)
    success_logs_today_ordered.reverse()
    
    if len(success_logs_today) == 0:
        shift_status = "Not Started"
    elif len(success_logs_today) % 2 == 1:
        shift_status = "Checked In"
    else:
        shift_status = "Checked Out"
        
    # Calculate active hours today
    active_hours_today = calculate_active_hours_today(success_logs_today_ordered)
        
    return {
        "status": "success",
        "profile": {
            "name": employee["name"],
            "email": employee["email"],
            "selfie_url": employee["selfie_url"],
            "registered_at": employee["created_at"]
        },
        "shift_status": shift_status,
        "active_hours_today": active_hours_today,
        "logs": logs
    }


# --- ADMIN DASHBOARD ENDPOINTS ---

@app.get("/api/admin/dashboard")
def get_admin_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin access only.")
        
    stats = db.get_dashboard_stats()
    threshold = float(db.get_system_setting("similarity_threshold", str(config.DEFAULT_THRESHOLD)))
    
    return {
        "status": "success",
        "stats": {
            "total_employees": stats["total_employees"],
            "active_today": stats["active_today"],
            "checked_out_today": stats.get("checked_out_today", 0),
            "absent_today": stats["absent_today"]
        },
        "threshold": threshold,
        "recent_logs": stats["recent_logs"],
        "database_type": db.get_db_type()
    }

@app.get("/api/admin/logs")
def get_all_admin_logs(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin access only.")
    logs = db.get_attendance_logs(limit=1000) # Fetch up to 1000 logs for history export
    return {
        "status": "success",
        "logs": logs
    }

@app.get("/api/admin/employees")
def get_admin_employees(search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin access only.")
    
    employees = db.list_employees(search_query=search)
    
    # Calculate today's active hours for each employee in the list
    today = date.today().isoformat()
    if db.USE_SUPABASE:
        start_of_today = f"{today}T00:00:00"
        try:
            logs_res = db.supabase_client.table("attendance_logs").select("employee_id, timestamp, status").eq("status", "success").gte("timestamp", start_of_today).execute()
            today_logs = logs_res.data or []
        except Exception:
            today_logs = []
    else:
        try:
            conn = db.get_db_connection()
            rows = conn.execute("""
            SELECT employee_id, timestamp, status 
            FROM attendance_logs 
            WHERE timestamp LIKE ? AND status = 'success'
            """, (f"{today}%",)).fetchall()
            today_logs = [dict(r) for r in rows]
            conn.close()
        except Exception:
            today_logs = []
            
    # Group logs by employee
    logs_by_emp = {}
    for log in today_logs:
        emp_id = log["employee_id"]
        if emp_id not in logs_by_emp:
            logs_by_emp[emp_id] = []
        logs_by_emp[emp_id].append(log)
        
    # Sort chronologically and calculate hours for each employee
    for emp in employees:
        emp_id = emp["id"]
        emp_logs = logs_by_emp.get(emp_id, [])
        emp_logs.sort(key=lambda x: x["timestamp"])
        emp["active_hours_today"] = calculate_active_hours_today(emp_logs)
        
    return {
        "status": "success",
        "employees": employees
    }

@app.post("/api/admin/settings")
def update_settings(data: ThresholdUpdateDTO, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin access only.")
        
    db.update_system_setting("similarity_threshold", str(data.threshold))
    logger.info(f"Admin updated similarity threshold to: {data.threshold}")
    
    return {
        "status": "success",
        "message": f"Similarity threshold updated to {data.threshold} successfully.",
        "threshold": data.threshold
    }

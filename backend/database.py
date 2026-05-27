import sqlite3
import json
import uuid
import logging
from datetime import datetime, date
from pathlib import Path
from supabase import create_client, Client
import backend.config as config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("database")

# Setup local SQLite path
SQLITE_DB_PATH = Path(__file__).parent / "attendance.db"

# State variables
USE_SUPABASE = False
supabase_client: Client = None

def init_db():
    global USE_SUPABASE, supabase_client
    
    # Check if Supabase config is provided
    if config.SUPABASE_URL and config.SUPABASE_KEY:
        try:
            logger.info("Configuring Supabase client...")
            # Normalize URL (remove /rest/v1/ if present at the end)
            url = config.SUPABASE_URL
            if url.endswith("/rest/v1/"):
                url = url[:-9]
            elif url.endswith("/rest/v1"):
                url = url[:-8]
                
            supabase_client = create_client(url, config.SUPABASE_KEY)
            
            # Simple ping test (read settings)
            try:
                supabase_client.table("system_settings").select("*").limit(1).execute()
                USE_SUPABASE = True
                logger.info("Successfully connected to Supabase Database!")
                
                # Seed default admin if empty
                try:
                    res = supabase_client.table("admins").select("id").limit(1).execute()
                    if not res.data:
                        import hashlib
                        salt = "zepiris_salt_2026"
                        hashed = hashlib.pbkdf2_hmac('sha256', b"Admin@123", salt.encode('utf-8'), 100000).hex()
                        password_hash = f"{salt}${hashed}"
                        supabase_client.table("admins").insert({
                            "id": str(uuid.uuid4()),
                            "email": "admin@zepiris.com",
                            "password_hash": password_hash,
                            "created_at": datetime.utcnow().isoformat()
                        }).execute()
                        logger.info("Default Supabase admin seeded: admin@zepiris.com / Admin@123")
                except Exception as seed_err:
                    logger.warning(f"Failed to seed default admin on Supabase: {seed_err}. (Make sure you have run the schema script in the Supabase SQL editor)")

                # Check/Create Supabase bucket for selfies
                try:
                    # Try to list buckets to see if we can connect
                    buckets = supabase_client.storage.list_buckets()
                    bucket_names = [b.name for b in buckets]
                    if "selfies" not in bucket_names:
                        logger.info("Creating Supabase storage bucket 'selfies'...")
                        supabase_client.storage.create_bucket("selfies", options={"public": True})
                except Exception as bucket_err:
                    logger.warning(f"Could not verify/create Supabase Storage bucket 'selfies': {bucket_err}. Ensure bucket is created manually.")
            except Exception as query_err:
                logger.warning(f"Supabase connection succeeded but database tables check failed: {query_err}")
                logger.warning("Falling back to local SQLite database. Please ensure you have run the schema script in the Supabase SQL editor.")
                init_sqlite()
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}. Falling back to SQLite.")
            init_sqlite()
    else:
        logger.info("Supabase credentials not fully configured. Using local SQLite.")
        init_sqlite()

def init_sqlite():
    global USE_SUPABASE
    USE_SUPABASE = False
    logger.info(f"Initializing local SQLite database at {SQLITE_DB_PATH}...")
    
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        created_at TIMESTAMP
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        selfie_url TEXT,
        created_at TIMESTAMP
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT,
        embedding TEXT, -- JSON string
        created_at TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT,
        timestamp TIMESTAMP,
        similarity_score REAL,
        confidence_score REAL,
        status TEXT,
        selfie_url TEXT,
        action TEXT,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
    """)
    
    # Proactively add 'action' column if database already exists without it
    try:
        cursor.execute("ALTER TABLE attendance_logs ADD COLUMN action TEXT")
    except sqlite3.OperationalError:
        pass
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP
    )
    """)
    
    # Insert default similarity threshold
    cursor.execute("""
    INSERT OR IGNORE INTO system_settings (key, value, updated_at) 
    VALUES (?, ?, ?)
    """, ("similarity_threshold", str(config.DEFAULT_THRESHOLD), datetime.utcnow().isoformat()))
    
    # Create default admin: admin@zepiris.com / Admin@123
    # Password hash for 'Admin@123' using our sha256 method
    cursor.execute("SELECT id FROM admins LIMIT 1")
    if not cursor.fetchone():
        import hashlib
        salt = "zepiris_salt_2026"
        hashed = hashlib.pbkdf2_hmac('sha256', b"Admin@123", salt.encode('utf-8'), 100000).hex()
        cursor.execute("""
        INSERT INTO admins (id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """, (str(uuid.uuid4()), "admin@zepiris.com", f"{salt}${hashed}", datetime.utcnow().isoformat()))
        logger.info("Default SQLite admin created: admin@zepiris.com / Admin@123")
        
    conn.commit()
    conn.close()

# Database Helper Functions
def get_db_connection():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# API Interface methods
def get_db_type():
    return "supabase" if USE_SUPABASE else "sqlite"

def get_admin_by_email(email: str):
    if USE_SUPABASE:
        res = supabase_client.table("admins").select("*").eq("email", email).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM admins WHERE email = ?", (email,)).fetchone()
        conn.close()
        return dict(row) if row else None

def create_admin(email: str, password_hash: str):
    new_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    if USE_SUPABASE:
        res = supabase_client.table("admins").insert({
            "id": new_id,
            "email": email,
            "password_hash": password_hash,
            "created_at": created_at
        }).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_db_connection()
        conn.execute("""
        INSERT INTO admins (id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """, (new_id, email, password_hash, created_at))
        conn.commit()
        conn.close()
        return {"id": new_id, "email": email, "password_hash": password_hash, "created_at": created_at}

def get_employee_by_email(email: str):
    if USE_SUPABASE:
        res = supabase_client.table("employees").select("*").eq("email", email).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM employees WHERE email = ?", (email,)).fetchone()
        conn.close()
        return dict(row) if row else None

def create_employee(name: str, email: str, password_hash: str, selfie_url: str, embedding: list):
    emp_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    
    if USE_SUPABASE:
        # Create employee
        emp_res = supabase_client.table("employees").insert({
            "id": emp_id,
            "name": name,
            "email": email,
            "password_hash": password_hash,
            "selfie_url": selfie_url,
            "created_at": created_at
        }).execute()
        
        # Save embedding
        supabase_client.table("embeddings").insert({
            "employee_id": emp_id,
            "embedding": embedding,
            "created_at": created_at
        }).execute()
        
        return emp_res.data[0] if emp_res.data else None
    else:
        conn = get_db_connection()
        try:
            # Create employee
            conn.execute("""
            INSERT INTO employees (id, name, email, password_hash, selfie_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (emp_id, name, email, password_hash, selfie_url, created_at))
            
            # Save embedding
            conn.execute("""
            INSERT INTO embeddings (employee_id, embedding, created_at)
            VALUES (?, ?, ?)
            """, (emp_id, json.dumps(embedding), created_at))
            
            conn.commit()
            return {"id": emp_id, "name": name, "email": email, "selfie_url": selfie_url, "created_at": created_at}
        except Exception as e:
            conn.rollback()
            logger.error(f"Error creating employee in SQLite: {e}")
            raise e
        finally:
            conn.close()

def get_employee_embedding(employee_id: str):
    if USE_SUPABASE:
        res = supabase_client.table("embeddings").select("embedding").eq("employee_id", employee_id).execute()
        return res.data[0]["embedding"] if res.data else None
    else:
        conn = get_db_connection()
        row = conn.execute("SELECT embedding FROM embeddings WHERE employee_id = ?", (employee_id,)).fetchone()
        conn.close()
        return json.loads(row["embedding"]) if row else None

def log_attendance(employee_id: str, status: str, similarity_score: float, confidence_score: float, selfie_url: str, action: str = None):
    timestamp = datetime.utcnow().isoformat()
    if USE_SUPABASE:
        try:
            res = supabase_client.table("attendance_logs").insert({
                "employee_id": employee_id,
                "timestamp": timestamp,
                "similarity_score": similarity_score,
                "confidence_score": confidence_score,
                "status": status,
                "selfie_url": selfie_url,
                "action": action
            }).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Failed to log attendance to Supabase with 'action' column: {e}. Retrying without 'action' column.")
            try:
                res = supabase_client.table("attendance_logs").insert({
                    "employee_id": employee_id,
                    "timestamp": timestamp,
                    "similarity_score": similarity_score,
                    "confidence_score": confidence_score,
                    "status": status,
                    "selfie_url": selfie_url
                }).execute()
                return res.data[0] if res.data else None
            except Exception as retry_err:
                logger.error(f"Failed to log attendance to Supabase completely: {retry_err}")
                return None
    else:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO attendance_logs (employee_id, timestamp, similarity_score, confidence_score, status, selfie_url, action)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (employee_id, timestamp, similarity_score, confidence_score, status, selfie_url, action))
        conn.commit()
        log_id = cursor.lastrowid
        conn.close()
        return {
            "id": log_id,
            "employee_id": employee_id,
            "timestamp": timestamp,
            "similarity_score": similarity_score,
            "confidence_score": confidence_score,
            "status": status,
            "selfie_url": selfie_url,
            "action": action
        }

def get_attendance_logs(employee_id: str = None, limit: int = 50, offset: int = 0):
    if USE_SUPABASE:
        query = supabase_client.table("attendance_logs").select("*, employees(name, email)")
        if employee_id:
            query = query.eq("employee_id", employee_id)
        res = query.order("timestamp", desc=True).range(offset, offset + limit - 1).execute()
        
        # Flatten structure for easy consumption
        logs = []
        for row in res.data:
            emp = row.pop("employees", {}) or {}
            row["employee_name"] = emp.get("name", "Unknown")
            row["employee_email"] = emp.get("email", "")
            logs.append(row)
        return logs
    else:
        conn = get_db_connection()
        query = """
        SELECT l.*, e.name as employee_name, e.email as employee_email 
        FROM attendance_logs l
        JOIN employees e ON l.employee_id = e.id
        """
        params = []
        if employee_id:
            query += " WHERE l.employee_id = ?"
            params.append(employee_id)
            
        query += " ORDER BY l.timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        rows = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]

def get_dashboard_stats():
    today = date.today().isoformat()
    
    if USE_SUPABASE:
        # Get total employees
        emp_res = supabase_client.table("employees").select("id", count="exact").execute()
        total_employees = emp_res.count if emp_res.count is not None else len(emp_res.data)
        
        # Get logs from today
        # Format start of today: today + "T00:00:00"
        start_of_today = f"{today}T00:00:00"
        logs_res = supabase_client.table("attendance_logs").select("employee_id, status").gte("timestamp", start_of_today).execute()
        
        # Count success check-in vs check-out. Active = odd count
        success_counts = {}
        for log in logs_res.data:
            if log["status"] == "success":
                emp_id = log["employee_id"]
                success_counts[emp_id] = success_counts.get(emp_id, 0) + 1
                
        active_today = sum(1 for emp_id, count in success_counts.items() if count % 2 == 1)
        absent_today = max(0, total_employees - active_today)
        
        # Get 10 recent logs
        recent_logs = get_attendance_logs(limit=10)
        
        return {
            "total_employees": total_employees,
            "active_today": active_today,
            "absent_today": absent_today,
            "recent_logs": recent_logs
        }
    else:
        conn = get_db_connection()
        
        # Total employees
        total_employees = conn.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
        
        # Active today (unique successful checkins today is odd)
        # SQLite store ISO strings. We search logs starting with today's date
        rows = conn.execute("""
        SELECT employee_id, COUNT(*) as cnt 
        FROM attendance_logs 
        WHERE timestamp LIKE ? AND status = 'success'
        GROUP BY employee_id
        """, (f"{today}%",)).fetchall()
        active_today = sum(1 for r in rows if r['cnt'] % 2 == 1)
        
        absent_today = max(0, total_employees - active_today)
        conn.close()
        
        # Recent logs
        recent_logs = get_attendance_logs(limit=10)
        
        return {
            "total_employees": total_employees,
            "active_today": active_today,
            "absent_today": absent_today,
            "recent_logs": recent_logs
        }

def get_system_setting(key: str, default: str):
    if USE_SUPABASE:
        res = supabase_client.table("system_settings").select("value").eq("key", key).execute()
        return res.data[0]["value"] if res.data else default
    else:
        conn = get_db_connection()
        row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
        conn.close()
        return row["value"] if row else default

def update_system_setting(key: str, value: str):
    updated_at = datetime.utcnow().isoformat()
    if USE_SUPABASE:
        res = supabase_client.table("system_settings").upsert({
            "key": key,
            "value": value,
            "updated_at": updated_at
        }).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_db_connection()
        conn.execute("""
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        """, (key, value, updated_at))
        conn.commit()
        conn.close()
        return {"key": key, "value": value, "updated_at": updated_at}

def list_employees(search_query: str = None):
    if USE_SUPABASE:
        query = supabase_client.table("employees").select("id, name, email, selfie_url, created_at")
        if search_query:
            query = query.or_(f"name.ilike.%{search_query}%,email.ilike.%{search_query}%")
        res = query.order("name").execute()
        return res.data
    else:
        conn = get_db_connection()
        query = "SELECT id, name, email, selfie_url, created_at FROM employees"
        params = []
        if search_query:
            query += " WHERE name LIKE ? OR email LIKE ?"
            like_query = f"%{search_query}%"
            params.extend([like_query, like_query])
        query += " ORDER BY name"
        rows = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]

def save_selfie(filename: str, file_bytes: bytes):
    """
    Saves selfie to Supabase Storage or local folder depending on settings.
    Returns the public access URL of the saved image.
    """
    # Create unique filename to prevent overwrites
    unique_filename = f"{uuid.uuid4()}_{filename}"
    
    if USE_SUPABASE:
        try:
            logger.info(f"Uploading selfie {unique_filename} to Supabase bucket 'selfies'...")
            # Upload file bytes
            res = supabase_client.storage.from_("selfies").upload(
                path=unique_filename,
                file=file_bytes,
                file_options={"content-type": "image/jpeg"}
            )
            # Obtain public url
            public_url = supabase_client.storage.from_("selfies").get_public_url(unique_filename)
            logger.info(f"Uploaded successfully. Public URL: {public_url}")
            return public_url
        except Exception as e:
            logger.error(f"Supabase Storage upload failed: {e}. Falling back to local upload.")
            # Fallback to local upload even if USE_SUPABASE is True, to prevent user crash
            return save_selfie_locally(unique_filename, file_bytes)
    else:
        return save_selfie_locally(unique_filename, file_bytes)

def save_selfie_locally(filename: str, file_bytes: bytes):
    logger.info(f"Saving selfie {filename} locally...")
    file_path = config.UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    # Return local backend relative URL path
    return f"/static/uploads/{filename}"

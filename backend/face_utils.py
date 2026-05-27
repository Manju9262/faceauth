import base64
import logging
import cv2
import numpy as np
from insightface.app import FaceAnalysis
import backend.config as config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face_utils")

# Initialize FaceAnalysis with the lightweight buffalo_sc model (approx. 12MB)
# It uses CPU execution provider as requested.
face_app = None

def get_face_app():
    global face_app
    if face_app is None:
        try:
            logger.info(f"Initializing InsightFace app using model: {config.MODEL_NAME}...")
            # We explicitly specify CPUExecutionProvider for CPU-only execution
            face_app = FaceAnalysis(name=config.MODEL_NAME, providers=['CPUExecutionProvider'])
            # det_size is the face detection input size, (640, 640) is robust and accurate
            face_app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace app initialized successfully!")
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace: {e}")
            raise e
    return face_app

def decode_base64_image(base64_str: str) -> np.ndarray:
    """
    Decodes a base64 encoded image string (with or without data prefix) into an OpenCV BGR image.
    """
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Failed to decode base64 image")
    return img

def extract_face_embedding(img: np.ndarray):
    """
    Processes the image using InsightFace.
    Validates:
      - At least one face is present
      - Only one face is present
      - Bounding box is reasonable
    Returns:
      - embedding: 512-dimensional float list
      - face_box: dict with box coordinates (for visual validation if needed)
    """
    # For debugging incoming captures
    try:
        debug_path = config.UPLOAD_DIR / "debug_received.jpg"
        cv2.imwrite(str(debug_path), img)
        logger.info(f"Saved incoming capture debug image to {debug_path}")
    except Exception as dbg_err:
        logger.warning(f"Failed to write debug capture image: {dbg_err}")

    app = get_face_app()
    # Runs face detection & embedding extraction
    faces = app.get(img)
    
    if not faces:
        raise ValueError("No face detected in the image. Please try again with better lighting.")
    
    if len(faces) > 1:
        raise ValueError("Multiple faces detected. Please ensure only one person is in the frame.")
    
    face = faces[0]
    # Check if face is mostly centered and has a high detection score
    if face.det_score < 0.4:
        raise ValueError("Face detection confidence too low. Please look directly at the camera.")
        
    bbox = face.bbox.astype(int).tolist() # [x1, y1, x2, y2]
    embedding = face.normed_embedding.astype(float).tolist() # L2 normed embedding vector
    
    return embedding, {
        "x1": bbox[0],
        "y1": bbox[1],
        "x2": bbox[2],
        "y2": bbox[3],
        "det_score": float(face.det_score)
    }

def compute_cosine_similarity(emb1: list, emb2: list) -> float:
    """
    Computes the cosine similarity between two embedding vectors.
    Formula: (A . B) / (||A|| ||B||)
    """
    A = np.array(emb1)
    B = np.array(emb2)
    
    dot_product = np.dot(A, B)
    norm_A = np.linalg.norm(A)
    norm_B = np.linalg.norm(B)
    
    if norm_A == 0.0 or norm_B == 0.0:
        return 0.0
        
    similarity = dot_product / (norm_A * norm_B)
    return float(similarity)

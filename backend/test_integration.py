import requests
import base64
import json

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    print("=== STARTING INTEGRATION TESTS FOR ZEPIRIS API ===")
    
    # 1. Test Admin Login
    print("\n[Test 1] Logging in as seeded Admin...")
    login_payload = {
        "email": "admin@zepiris.com",
        "password": "Admin@123",
        "role": "admin"
    }
    res = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
    if res.status_code == 200:
        data = res.json()
        token = data["token"]
        print(" SUCCESS: Admin logged in! JWT Token obtained.")
    else:
        print(f" FAILURE: Login failed. Code: {res.status_code}, Body: {res.text}")
        return

    # 2. Test Admin Dashboard Access
    print("\n[Test 2] Fetching Admin Dashboard stats...")
    headers = {"Authorization": f"Bearer {token}"}
    res = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(" SUCCESS: Dashboard details loaded:")
        print(f"   Database Mode: {data.get('database_type')}")
        print(f"   Stats: {json.dumps(data.get('stats'))}")
        print(f"   Threshold: {data.get('threshold')}")
    else:
        print(f" FAILURE: Failed to load admin dashboard. Code: {res.status_code}, Body: {res.text}")
        return

    # 3. Test Face Validation Error (Registering with 1x1 black pixel)
    print("\n[Test 3] Testing Face Validation - Registering employee with invalid photo...")
    # 1x1 black GIF base64
    tiny_base64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    reg_payload = {
        "name": "Test Employee",
        "email": "test_emp@zepiris.com",
        "password": "Password@123",
        "selfie": tiny_base64
    }
    res = requests.post(f"{BASE_URL}/api/auth/register-employee", json=reg_payload)
    if res.status_code == 400:
        data = res.json()
        print(f" SUCCESS: Registration rejected as expected. Error message: '{data.get('detail')}'")
    else:
        print(f" FAILURE: Registration should have failed. Code: {res.status_code}, Body: {res.text}")
        return

    # 4. Test Threshold Update
    print("\n[Test 4] Updating similarity threshold to 0.70...")
    update_payload = {"threshold": 0.70}
    res = requests.post(f"{BASE_URL}/api/admin/settings", json=update_payload, headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(f" SUCCESS: Threshold updated to {data.get('threshold')}")
    else:
        print(f" FAILURE: Failed to update threshold. Code: {res.status_code}, Body: {res.text}")
        return

    # Re-fetch stats to confirm threshold update
    res = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(f" Verify: Dashboard reports threshold is now: {data.get('threshold')}")
        
    print("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_tests()

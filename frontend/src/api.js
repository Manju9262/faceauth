// API Client Wrapper for ZepIris Attendance System

const API_BASE = import.meta.env.VITE_API_URL || ""; // Fallback to Vite dev proxy if variable is not set

function getHeaders() {
  const token = localStorage.getItem("zepiris_token");
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.detail || "An unexpected error occurred.";
    throw new Error(errorMsg);
  }
  return data;
}

export const api = {
  // Authentication
  async login(email, password, role) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ email, password, role }),
    });
    const result = await handleResponse(response);
    if (result.token) {
      localStorage.setItem("zepiris_token", result.token);
      localStorage.setItem("zepiris_user", JSON.stringify(result.user));
    }
    return result;
  },

  logout() {
    localStorage.removeItem("zepiris_token");
    localStorage.removeItem("zepiris_user");
  },

  getCurrentUser() {
    try {
      const userStr = localStorage.getItem("zepiris_user");
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  async registerEmployee(name, email, password, selfie) {
    const response = await fetch(`${API_BASE}/api/auth/register-employee`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, email, password, selfie }),
    });
    return handleResponse(response);
  },

  // Attendance
  async markAttendance(selfie, deviceInfo = "Web Browser") {
    const response = await fetch(`${API_BASE}/api/attendance/mark`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ selfie, device_info: deviceInfo }),
    });
    return handleResponse(response);
  },

  // Dashboards
  async getEmployeeDashboard() {
    const response = await fetch(`${API_BASE}/api/employee/dashboard`, {
      method: "GET",
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async getAdminDashboard() {
    const response = await fetch(`${API_BASE}/api/admin/dashboard`, {
      method: "GET",
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async getAdminEmployees(search = "") {
    const url = search 
      ? `${API_BASE}/api/admin/employees?search=${encodeURIComponent(search)}` 
      : `${API_BASE}/api/admin/employees`;
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async updateThreshold(threshold) {
    const response = await fetch(`${API_BASE}/api/admin/settings`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ threshold }),
    });
    return handleResponse(response);
  }
};

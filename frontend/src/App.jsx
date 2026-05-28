import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  User, 
  Users, 
  Clock, 
  LogOut, 
  RefreshCw, 
  Search, 
  Sliders, 
  CheckCircle2, 
  XCircle, 
  Check,
  Camera, 
  Calendar,
  Lock,
  Mail,
  UserCheck,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { api } from './api';
import CameraCapture from './components/CameraCapture';

export default function App() {
  const [view, setView] = useState('login'); // 'login', 'register', 'employee_dashboard', 'admin_dashboard', 'mark_attendance'
  const [role, setRole] = useState('employee'); // Auth login role: 'employee' or 'admin'
  const [currentUser, setCurrentUser] = useState(null);
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSelfie, setRegSelfie] = useState(null);
  
  // Dashboard & Application states
  const [employeeData, setEmployeeData] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [adminEmployees, setAdminEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [threshold, setThreshold] = useState(0.65);
  
  // Notification Toast states
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message: '' }
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Processing...');
  const [confirmationData, setConfirmationData] = useState(null);

  // Auto load logged-in user on start
  useEffect(() => {
    const user = api.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      if (user.role === 'admin') {
        setView('admin_dashboard');
        loadAdminDashboard();
      } else {
        setView('employee_dashboard');
        loadEmployeeDashboard();
      }
    }
  }, []);

  // Show auto-expiring toast helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // --- API OPERATIONS ---

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoadingMsg("Authenticating your credentials...");
    setLoading(true);
    try {
      const data = await api.login(email, password, role);
      setCurrentUser(data.user);
      showToast(`Welcome back, ${data.user.name || 'Admin'}!`, 'success');
      
      if (role === 'admin') {
        setView('admin_dashboard');
        loadAdminDashboard();
      } else {
        setView('employee_dashboard');
        loadEmployeeDashboard();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterEmployee = async (e) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword || !regSelfie) {
      showToast("Please fill in all details and capture your selfie.", "error");
      return;
    }
    setLoadingMsg("Creating profile & generating biometric face embedding...");
    setLoading(true);
    try {
      await api.registerEmployee(regName, regEmail, regPassword, regSelfie);
      showToast("Registration successful! You can now login.", "success");
      // Reset registration form
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setRegSelfie(null);
      setView('login');
      setRole('employee');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAttendance = async (selfieBase64) => {
    setLoadingMsg("Analyzing selfie & matching face biometric signature...");
    setLoading(true);
    try {
      const result = await api.markAttendance(selfieBase64, navigator.userAgent.includes("Mobi") ? "Mobile Browser" : "Desktop Browser");
      showToast("Attendance marked successfully!", "success");
      
      // Save details for the confirmation page
      setConfirmationData({
        name: currentUser.name,
        action: result.message.includes("Check Out") ? "Check Out" : "Check In",
        similarity_score: result.similarity_score,
        timestamp: new Date().toISOString()
      });
      setView('attendance_confirmation');
    } catch (err) {
      showToast(err.message, "error");
      // Reload dashboard in background to show failed log
      loadEmployeeDashboard();
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeDashboard = async () => {
    try {
      const data = await api.getEmployeeDashboard();
      setEmployeeData(data);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const loadAdminDashboard = async () => {
    try {
      const data = await api.getAdminDashboard();
      setAdminData(data);
      setThreshold(data.threshold);
      // Also load employee directory list
      const empList = await api.getAdminEmployees(searchQuery);
      setAdminEmployees(empList.employees);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Search trigger for Admin
  useEffect(() => {
    if (view === 'admin_dashboard') {
      const delaySearch = setTimeout(async () => {
        try {
          const empList = await api.getAdminEmployees(searchQuery);
          setAdminEmployees(empList.employees);
        } catch (e) {}
      }, 300);
      return () => clearTimeout(delaySearch);
    }
  }, [searchQuery]);

  const handleThresholdChange = async (e) => {
    const val = parseFloat(e.target.value);
    setThreshold(val);
  };

  const handleSaveThreshold = async () => {
    setLoadingMsg("Saving matchmaking threshold settings...");
    setLoading(true);
    try {
      await api.updateThreshold(threshold);
      showToast(`Threshold updated to ${threshold.toFixed(2)}`, "success");
      loadAdminDashboard();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setEmployeeData(null);
    setAdminData(null);
    setEmail('');
    setPassword('');
    setView('login');
    showToast("Logged out successfully.", "info");
  };

  const handleExportCSV = async (type) => {
    setLoadingMsg("Generating CSV export report...");
    setLoading(true);
    try {
      let csvContent = "";
      let filename = "";

      if (type === 'roster') {
        filename = `zepiris_employee_roster_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = "Employee ID,Name,Email,Registration Date,Active Hours Today\n";
        adminEmployees.forEach(emp => {
          const hours = emp.active_hours_today !== undefined ? emp.active_hours_today : 0;
          csvContent += `"${emp.id}","${emp.name.replace(/"/g, '""')}","${emp.email}","${emp.created_at}","${hours}"\n`;
        });
      } 
      else if (type === 'active_shifts') {
        filename = `zepiris_active_shifts_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = "Employee ID,Name,Email,Status,Active Hours Today\n";
        
        const response = await api.getAdminLogs();
        const logs = response.logs || [];
        const todayStr = new Date().toISOString().split('T')[0];
        
        const latestSuccessLog = {};
        logs.forEach(log => {
          if (log.status === 'success' && log.timestamp.startsWith(todayStr)) {
            if (!latestSuccessLog[log.employee_id]) {
              latestSuccessLog[log.employee_id] = log;
            }
          }
        });
        
        adminEmployees.forEach(emp => {
          const lastLog = latestSuccessLog[emp.id];
          const isCurrentlyCheckedIn = lastLog && lastLog.action === 'Check In';
          if (isCurrentlyCheckedIn) {
            const hours = emp.active_hours_today !== undefined ? emp.active_hours_today : 0;
            csvContent += `"${emp.id}","${emp.name.replace(/"/g, '""')}","${emp.email}","Checked In","${hours}"\n`;
          }
        });
        
        if (csvContent === "Employee ID,Name,Email,Status,Active Hours Today\n") {
          csvContent += ",,No employees currently active on shift,,\n";
        }
      } 
      else if (type === 'attendance_history') {
        filename = `zepiris_attendance_history_${new Date().toISOString().split('T')[0]}.csv`;
        const response = await api.getAdminLogs();
        const logs = response.logs || [];
        
        csvContent = "Log ID,Employee Name,Employee Email,Timestamp (UTC),Action,Similarity Score,Status\n";
        logs.forEach(log => {
          csvContent += `"${log.id}","${log.employee_name.replace(/"/g, '""')}","${log.employee_email}","${log.timestamp}","${log.action || 'Check In'}","${(log.similarity_score * 100).toFixed(1)}%","${log.status}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Report downloaded successfully!", "success");
    } catch (err) {
      showToast("Failed to generate report: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Helper date formatting
  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      // Format to local date and time: e.g. 2026-05-27 12:45 PM
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };


  // --- VIEW RENDERING ---

  return (
    <div className="app-container">
      {/* Toast Alert Box */}
      {toast && (
        <div className={`alert-toast ${toast.type}`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <XCircle size={18} />}
          {toast.type === 'info' && <TrendingUp size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Header bar */}
      <header className="header">
        <div className="logo" onClick={() => currentUser ? (currentUser.role === 'admin' ? setView('admin_dashboard') : setView('employee_dashboard')) : setView('login')} style={{ cursor: 'pointer' }}>
          <Shield size={28} style={{ color: 'var(--primary)' }} />
          <span>ZepIris <span style={{ fontWeight: '300', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Attendance</span></span>
        </div>
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Logged in as <strong style={{ color: 'var(--text-main)' }}>{currentUser.name || 'Admin'}</strong> ({currentUser.role})
            </span>
            <button className="btn-secondary" onClick={handleLogout} style={{ padding: '0.5rem 0.8rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <LogOut size={14} />
              Logout
            </button>
          </div>
        )}
      </header>

      {/* Route Selector Panels */}
      
      {/* 1. LOGIN PANEL */}
      {view === 'login' && (
        <div className="glass-panel auth-split-card fade-in">
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Access Portal</h2>
          <p style={{ textSelf: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            Secure facial authentication platform
          </p>
          
          <div className="auth-tabs">
            <button 
              className={`auth-tab-btn ${role === 'employee' ? 'active' : ''}`}
              onClick={() => setRole('employee')}
            >
              <User size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Employee
            </button>
            <button 
              className={`auth-tab-btn ${role === 'admin' ? 'active' : ''}`}
              onClick={() => setRole('admin')}
            >
              <Shield size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Administrator
            </button>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com" 
                  required 
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  required 
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? "Authenticating..." : "Login to Workspace"}
            </button>

            {role === 'employee' && (
              <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                New employee?{" "}
                <span 
                  onClick={() => setView('register')} 
                  style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
                >
                  Register selfie profile here
                </span>
              </p>
            )}
          </form>
        </div>
      )}

      {/* 2. EMPLOYEE REGISTRATION PANEL */}
      {view === 'register' && (
        <div className="glass-panel fade-in" style={{ maxWidth: '650px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Create Employee Account</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Register your profile with details and a reference verification selfie.
          </p>

          <form onSubmit={handleRegisterEmployee}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="John Doe" 
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="john.doe@company.com" 
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Create Password</label>
                  <input 
                    type="password" 
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 6 characters" 
                    required 
                  />
                </div>

                <div className="glass-card" style={{ marginTop: '1.5rem', background: 'rgba(99,102,241,0.02)' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Shield size={14} style={{ color: 'var(--primary)' }} />
                    Facial Validation Instructions
                  </h4>
                  <ul style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <li>Ensure only ONE face is present in the frame.</li>
                    <li>Ensure proper lighting on your face.</li>
                    <li>Position your face centered within the guide lines.</li>
                  </ul>
                </div>
              </div>

              {/* Selfie Camera Step */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label className="form-group" style={{ width: '100%', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Register Reference Selfie
                </label>
                
                <CameraCapture 
                  onCapture={(base64) => setRegSelfie(base64)} 
                  buttonText="Capture Registration Selfie"
                  loading={loading}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => {
                  setView('login');
                  setRegSelfie(null);
                }}
                style={{ flex: 1 }}
              >
                Back to Login
              </button>
              
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ flex: 2 }}
                disabled={loading || !regSelfie}
              >
                {loading ? "Registering profile..." : "Create Account & Submit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. EMPLOYEE DASHBOARD */}
      {view === 'employee_dashboard' && employeeData && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }} className="dashboard-grid">
            
            {/* Left Col: Employee Details */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                <img 
                  src={employeeData.profile.selfie_url} 
                  alt="Registered Face" 
                  className="avatar-lg"
                  onError={(e) => {
                    // Fallback to placeholder avatar if image fails to load
                    e.target.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";
                  }}
                />
                <span className="badge badge-success" style={{ position: 'absolute', bottom: 0, right: 0, border: '2px solid var(--bg-main)' }}>
                  Active
                </span>
              </div>
              
              <h3 style={{ marginBottom: '0.25rem' }}>{employeeData.profile.name}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>{employeeData.profile.email}</p>
              
              <div style={{ width: '100%', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem', textAlign: 'left', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Registered on:</span>
                  <span>{new Date(employeeData.profile.registered_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>System Status:</span>
                  <span style={{ color: 'var(--success)', fontWeight: '600' }}>Synced</span>
                </div>
              </div>
            </div>

            {/* Right Col: Shift & Checkin action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Shift status & Hours card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Shift Status (Today)
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.6rem' }}>{employeeData.shift_status}</h2>
                    {employeeData.shift_status === 'Checked In' && (
                      <span className="badge badge-success">Active</span>
                    )}
                    {employeeData.shift_status === 'Checked Out' && (
                      <span className="badge badge-success" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', borderColor: 'var(--border-glass)' }}>Inactive</span>
                    )}
                    {employeeData.shift_status === 'Not Started' && (
                      <span className="badge badge-danger" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>Pending</span>
                    )}
                  </div>
                </div>

                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Active Hours (Today)
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                    <h2 style={{ fontSize: '2rem', color: 'var(--primary)' }}>{employeeData.active_hours_today !== undefined ? employeeData.active_hours_today : '0.00'}</h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>hours</span>
                  </div>
                  <Clock size={48} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05, strokeWidth: 1.5 }} />
                </div>
              </div>

              {/* Action Button Card */}
              <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '500' }}>Ready to update your status?</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Perform face verification to toggle shift checkin/checkout</p>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={() => setView('mark_attendance')}
                  style={{ padding: '0.8rem 1.5rem' }}
                >
                  <Camera size={18} />
                  {employeeData.shift_status === 'Not Started' && 'Check In'}
                  {employeeData.shift_status === 'Checked In' && 'Check Out'}
                  {employeeData.shift_status === 'Checked Out' && 'Check In'}
                </button>
              </div>

              {/* Attendance timeline history */}
              <div className="glass-panel" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3>Attendance Logs</h3>
                  <button className="btn-secondary" onClick={loadEmployeeDashboard} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                    <RefreshCw size={12} />
                    Refresh
                  </button>
                </div>

                {employeeData.logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <Clock size={40} style={{ margin: '0 auto 1rem', strokeWidth: 1.5 }} />
                    <p>No check-in logs recorded yet.</p>
                  </div>
                ) : (
                  <div className="logs-table-container">
                    <table className="logs-table">
                      <thead>
                        <tr>
                          <th>Captured Selfie</th>
                          <th>Timestamp (UTC)</th>
                          <th>Match Score</th>
                          <th>Verification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeData.logs.map((log) => (
                          <tr key={log.id}>
                            <td>
                              {log.selfie_url ? (
                                <img 
                                  src={log.selfie_url} 
                                  alt="Capture" 
                                  className="avatar"
                                  onError={(e) => {
                                    e.target.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80";
                                  }}
                                />
                              ) : (
                                <div className="avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <User size={16} />
                                </div>
                              )}
                            </td>
                            <td>{formatDate(log.timestamp)}</td>
                            <td>
                              {log.status === 'success' ? (
                                <strong style={{ color: 'var(--success)' }}>
                                  {(log.similarity_score * 100).toFixed(1)}%
                                </strong>
                              ) : (
                                <span style={{ color: 'var(--danger)' }}>
                                  {log.similarity_score > 0 ? `${(log.similarity_score * 100).toFixed(1)}%` : "N/A"}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. MARK ATTENDANCE CAM VIEW */}
      {view === 'mark_attendance' && (
        <div className="glass-panel fade-in" style={{ maxWidth: '550px', margin: '0 auto', width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.25rem' }}>Mark Work Shift Attendance</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Look directly at the camera. Once face validation turns green, capture your selfie to verify identity.
          </p>

          <CameraCapture 
            onCapture={handleMarkAttendance} 
            buttonText="Verify & Mark Attendance"
            loading={loading}
          />

          <button 
            className="btn-secondary" 
            onClick={() => {
              setView('employee_dashboard');
              loadEmployeeDashboard();
            }}
            style={{ width: '100%', maxWidth: '480px', marginTop: '1.5rem' }}
          >
            Cancel and Return
          </button>
        </div>
      )}

      {/* 5. ADMIN DASHBOARD */}
      {view === 'admin_dashboard' && adminData && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem' }}>Management Console</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Monitor biometric attendance, thresholds, and export shift logs</p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    handleExportCSV(e.target.value);
                    e.target.value = ""; 
                  }
                }}
                defaultValue=""
                style={{ 
                  padding: '0.6rem 1rem', 
                  fontSize: '0.85rem', 
                  width: 'auto', 
                  background: 'var(--primary-light)', 
                  color: 'var(--text-main)', 
                  borderColor: 'rgba(99, 102, 241, 0.3)',
                  cursor: 'pointer' 
                }}
              >
                <option value="" disabled>📥 Export Logs & Reports</option>
                <option value="roster">Employee Roster & Working Hours (Today)</option>
                <option value="active_shifts">Active Shifts (Checked In Today)</option>
                <option value="attendance_history">Full Attendance History Logs</option>
              </select>
            </div>
          </div>

          {/* Header Analytics Cards Row */}
          <div className="dashboard-grid">
            <div className="glass-panel analytics-card">
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Employees</span>
                <h1 style={{ fontSize: '2.5rem', marginTop: '0.25rem' }}>{adminData.stats.total_employees}</h1>
              </div>
              <div className="analytics-icon">
                <Users size={22} />
              </div>
            </div>

            <div className="glass-panel analytics-card success">
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Shift Today</span>
                <h1 style={{ fontSize: '2.5rem', marginTop: '0.25rem' }}>{adminData.stats.active_today}</h1>
              </div>
              <div className="analytics-icon">
                <UserCheck size={22} />
              </div>
            </div>

            <div className="glass-panel analytics-card danger">
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Absent / Not Started</span>
                <h1 style={{ fontSize: '2.5rem', marginTop: '0.25rem' }}>{adminData.stats.absent_today}</h1>
              </div>
              <div className="analytics-icon">
                <AlertTriangle size={22} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '1.5rem' }} className="dashboard-grid">
            
            {/* Left Col: Config & Employee Directory */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Donut Chart Panel */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
                  Shift Distribution (Today)
                </h3>
                {(() => {
                  const active = adminData.stats.active_today || 0;
                  const inactive = adminData.stats.checked_out_today || 0;
                  const pending = adminData.stats.absent_today || 0;
                  const total = active + inactive + pending || 1;
                  
                  const activePct = active / total;
                  const inactivePct = inactive / total;
                  const pendingPct = pending / total;

                  const circ = 251.327; // 2 * Math.PI * 40
                  
                  const activeStroke = activePct * circ;
                  const inactiveStroke = inactivePct * circ;
                  const pendingStroke = pendingPct * circ;

                  const activeOffset = 0;
                  const inactiveOffset = circ - activeStroke;
                  const pendingOffset = circ - activeStroke - inactiveStroke;

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                          
                          {pending > 0 && (
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--danger)" strokeWidth="10"
                              strokeDasharray={`${pendingStroke} ${circ - pendingStroke}`}
                              strokeDashoffset={pendingOffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                          )}

                          {inactive > 0 && (
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--text-muted)" strokeWidth="10"
                              strokeDasharray={`${inactiveStroke} ${circ - inactiveStroke}`}
                              strokeDashoffset={inactiveOffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                          )}

                          {active > 0 && (
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--success)" strokeWidth="10"
                              strokeDasharray={`${activeStroke} ${circ - activeStroke}`}
                              strokeDashoffset={activeOffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                          )}
                        </svg>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{active + inactive}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>PRESENT</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '120px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }} />
                          <span>Active: <strong>{active}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                          <span>Checked Out: <strong>{inactive}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)' }} />
                          <span>Pending: <strong>{pending}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Threshold panel */}
              <div className="glass-panel">
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={18} style={{ color: 'var(--primary)' }} />
                  ArcFace Match Control
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    Adjust the Cosine Similarity threshold. Lowering it increases matching ease, raising it prevents false matches.
                  </p>
                  
                  <div className="slider-container">
                    <input 
                      type="range"
                      min="0.4"
                      max="0.9"
                      step="0.01"
                      value={threshold}
                      onChange={handleThresholdChange}
                      className="slider-input"
                    />
                    <strong style={{ fontSize: '1.1rem', minWidth: '40px', textAlign: 'right' }}>
                      {threshold.toFixed(2)}
                    </strong>
                  </div>
                  
                  <button className="btn-primary" onClick={handleSaveThreshold} style={{ width: '100%' }}>
                    Save Threshold Setting
                  </button>
                </div>
              </div>

              {/* Employee Directory */}
              <div className="glass-panel" style={{ flex: 1 }}>
                <h3 style={{ marginBottom: '1rem' }}>Employee Roster</h3>
                
                {/* Search field */}
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or email..."
                    style={{ paddingLeft: '2.5rem', paddingRight: '1rem', paddingVertical: '0.6rem' }}
                  />
                </div>

                {adminEmployees.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No employees registered.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {adminEmployees.map(emp => (
                      <div key={emp.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem' }}>
                        <img 
                          src={emp.selfie_url} 
                          alt={emp.name} 
                          className="avatar" 
                          onError={(e) => {
                            e.target.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80";
                          }}
                        />
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                          <h4 style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{emp.name}</h4>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{emp.email}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--primary)' }}>
                            {emp.active_hours_today !== undefined ? `${emp.active_hours_today} hrs` : '0.00 hrs'}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>today</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Live Logs Feed */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3>Live Verification Log</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Running in <strong style={{ color: 'var(--primary)' }}>{adminData.database_type.toUpperCase()}</strong> storage mode
                  </span>
                </div>
                <button className="btn-secondary" onClick={loadAdminDashboard} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  <RefreshCw size={12} style={{ marginRight: '0.25rem' }} />
                  Refresh Logs
                </button>
              </div>

              {adminData.recent_logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem 1rem', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Clock size={48} style={{ margin: '0 auto 1rem', strokeWidth: 1.5 }} />
                  <p>No verification activities logged today.</p>
                </div>
              ) : (
                <div className="logs-table-container" style={{ flex: 1 }}>
                  <table className="logs-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Selfie Preview</th>
                        <th>Timestamp (Local)</th>
                        <th>Action</th>
                        <th>Similarity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminData.recent_logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <strong style={{ display: 'block', color: 'var(--text-main)' }}>{log.employee_name}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.employee_email}</span>
                          </td>
                          <td>
                            {log.selfie_url ? (
                              <img 
                                src={log.selfie_url} 
                                alt="Capture" 
                                className="avatar"
                                style={{
                                  transition: 'transform 0.2s',
                                  cursor: 'zoom-in'
                                }}
                                onClick={(e) => {
                                  // Expand visual preview
                                  window.open(log.selfie_url, '_blank');
                                }}
                                onError={(e) => {
                                  e.target.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80";
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No image</span>
                            )}
                          </td>
                          <td>{formatDate(log.timestamp)}</td>
                          <td>
                            <span className="badge" style={{ 
                              background: log.action === 'Check Out' ? 'var(--primary-light)' : 'var(--success-light)',
                              color: log.action === 'Check Out' ? 'var(--secondary)' : 'var(--success)',
                              borderColor: log.action === 'Check Out' ? 'rgba(168, 85, 247, 0.2)' : 'var(--success-border)',
                              borderStyle: 'solid',
                              borderWidth: '1px'
                            }}>
                              {log.action || 'Check In'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: log.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                                {(log.similarity_score * 100).toFixed(1)}%
                              </strong>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Threshold: {(threshold * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
      
      {/* 6. ATTENDANCE CONFIRMATION PANEL */}
      {view === 'attendance_confirmation' && confirmationData && (
        <div className="glass-panel confirmation-card fade-in" style={{ maxWidth: '450px', margin: '4rem auto', width: '100%', textAlign: 'center' }}>
          <div className="checkmark-wrapper">
            <div className="checkmark-circle">
              <Check size={48} className="checkmark-icon" />
            </div>
          </div>
          
          <h2 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            {confirmationData.action === 'Check In' ? 'Checked In Successfully!' : 'Checked Out Successfully!'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Your shift status has been recorded in the database.
          </p>

          <div className="glass-card" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', background: 'rgba(255, 255, 255, 0.01)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Employee</span>
              <strong>{confirmationData.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Action</span>
              <span className={`badge ${confirmationData.action === 'Check In' ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'none' }}>
                {confirmationData.action}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Timestamp</span>
              <strong>{formatDate(confirmationData.timestamp)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Similarity Score</span>
              <strong style={{ color: 'var(--success)' }}>
                {(confirmationData.similarity_score * 100).toFixed(1)}%
              </strong>
            </div>
          </div>

          <button 
            className="btn-primary" 
            onClick={() => {
              setView('employee_dashboard');
              loadEmployeeDashboard();
            }}
            style={{ width: '100%' }}
          >
            Go to Dashboard
          </button>
        </div>
      )}

      {/* Fullscreen Loading Overlay */}
      {loading && view !== 'login' && (
        <div className="loading-overlay">
          <div className="loading-card glass-panel">
            <div className="scanner-line-wrapper">
              <div className="scanner-laser" />
            </div>
            <div className="spinner-glow" />
            <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{loadingMsg}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Please keep this tab active. This may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* Visual Footer */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-glass)', padding: '1.5rem 0 0.5rem 0', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>&copy; 2026 ZepIris Inc. Enterprise Face Attendance System.</span>
        <span>Secure Model: ArcFace (InsightFace)</span>
      </footer>
    </div>
  );
}

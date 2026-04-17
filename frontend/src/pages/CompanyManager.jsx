import { useState, useEffect, useCallback } from "react";

const NODE_URL = "http://127.0.0.1:5000";

function truncate(str, n = 12) {
  if (!str) return "—";
  if (str.length <= n * 2 + 3) return str;
  return str.slice(0, n) + "..." + str.slice(-n);
}

export default function CompanyManager() {
  const [tab, setTab] = useState("create");
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // Form states
  const [companyName, setCompanyName] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [employeeRole, setEmployeeRole] = useState("employee");
  const [approvalThreshold, setApprovalThreshold] = useState(0);
  const [approvalRoles, setApprovalRoles] = useState([]);

  const walletAddress = typeof window !== "undefined" ? localStorage.getItem("walletAddress") : null;
  const publicKey = typeof window !== "undefined" ? localStorage.getItem("publicKey") : null;

  // Fetch all companies
  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch(`${NODE_URL}/companies`);
      const data = await res.json();
      setCompanies(data);
    } catch (e) {
      console.error("Failed to fetch companies:", e);
    }
  }, []);

  // Fetch pending approvals for selected company
  const fetchPendingApprovals = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const res = await fetch(`${NODE_URL}/pending_approvals/${selectedCompany.company_id}`);
      const data = await res.json();
      setPendingApprovals(data.pending || []);
      if (selectedCompany) {
        setApprovalThreshold(data.approval_threshold || 0);
        setApprovalRoles(data.required_roles || []);
      }
    } catch (e) {
      console.error("Failed to fetch pending approvals:", e);
    }
  }, [selectedCompany]);

  useEffect(() => {
    fetchCompanies();
    const interval = setInterval(fetchCompanies, 10000);
    return () => clearInterval(interval);
  }, [fetchCompanies]);

  useEffect(() => {
    fetchPendingApprovals();
    const interval = setInterval(fetchPendingApprovals, 5000);
    return () => clearInterval(interval);
  }, [fetchPendingApprovals]);

  // Create Company
  const handleCreateCompany = async () => {
    if (!companyName.trim()) {
      setStatus({ ok: false, msg: "Enter company name" });
      return;
    }
    if (!walletAddress || !publicKey) {
      setStatus({ ok: false, msg: "Sign in with wallet first" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${NODE_URL}/create_company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName,
          owner_address: walletAddress,
          owner_public_key: publicKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setStatus({ ok: true, msg: `✓ Company "${companyName}" created!` });
      setCompanyName("");
      fetchCompanies();
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Add Employee
  const handleAddEmployee = async () => {
    if (!selectedCompany) {
      setStatus({ ok: false, msg: "Select a company first" });
      return;
    }
    if (!employeeAddress.trim()) {
      setStatus({ ok: false, msg: "Enter employee address" });
      return;
    }

    setLoading(true);
    try {
      const placeholderPubKey = `-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${employeeAddress.slice(2, 66)}\n-----END PUBLIC KEY-----`;

      const res = await fetch(`${NODE_URL}/add_employee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.company_id,
          employee_address: employeeAddress,
          employee_public_key: placeholderPubKey,
          role: employeeRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setStatus({ ok: true, msg: `✓ Employee added as ${employeeRole}!` });
      setEmployeeAddress("");
      setEmployeeRole("employee");
      fetchCompanies();
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Set Approval Rules
  const handleSetApprovalRules = async () => {
    if (!selectedCompany) {
      setStatus({ ok: false, msg: "Select a company first" });
      return;
    }
    if (selectedCompany.owner !== walletAddress) {
      setStatus({ ok: false, msg: "Only company owner can set approval rules" });
      return;
    }
    if (approvalRoles.length === 0) {
      setStatus({ ok: false, msg: "Select at least one approver role" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${NODE_URL}/set_approval_rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.company_id,
          threshold: parseFloat(approvalThreshold) || 0,
          required_approvers: approvalRoles,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setStatus({ ok: true, msg: `✓ Approval rules set! Threshold: ${approvalThreshold}, Approvers: ${approvalRoles.join(", ")}` });
      fetchPendingApprovals();
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Submit Approval
  const handleApproveTransaction = async (txId, decision) => {
    if (!selectedCompany) return;

    setLoading(true);
    try {
      const res = await fetch(`${NODE_URL}/approve_transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.company_id,
          tx_id: txId,
          approver_address: walletAddress,
          decision: decision,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setStatus({ ok: true, msg: `✓ Transaction ${decision}!` });
      fetchPendingApprovals();

      // If approved, offer to submit for mining
      if (data.status === "approved") {
        setTimeout(async () => {
          const submitRes = await fetch(`${NODE_URL}/submit_for_mining/${selectedCompany.company_id}/${txId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (submitRes.ok) {
            setStatus({ ok: true, msg: `✓ Transaction submitted to mining pool!` });
            fetchPendingApprovals();
          }
        }, 500);
      }
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  const tabs = ["create", "manage", "employees", "approvals", "pending"];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "var(--font-sans)" }}>
      <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
        Company Manager
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>
        Create and manage organizations with approval workflows
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 0, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--color-text-primary)" : "2px solid transparent",
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: tab === t ? 500 : 400,
              color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              cursor: "pointer",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {t === "create" && "Create"}
            {t === "manage" && "My Companies"}
            {t === "employees" && "Employees"}
            {t === "approvals" && "⚙️ Approval Rules"}
            {t === "pending" && "🔔 Pending Approvals"}
          </button>
        ))}
      </div>

      {/* CREATE COMPANY */}
      {tab === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Company Name
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp, Tech Startup, etc."
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>
            You'll be set as the owner of this company. You can add employees and set approval rules.
          </p>
          <button onClick={handleCreateCompany} disabled={loading}>
            {loading ? "Creating..." : "🏢 Create Company"}
          </button>
          {status && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "var(--border-radius-md)",
                fontSize: 13,
                background: status.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
                color: status.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
                border: `0.5px solid ${status.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
              }}
            >
              {status.msg}
            </div>
          )}
        </div>
      )}

      {/* MANAGE COMPANIES */}
      {tab === "manage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {companies.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>No companies yet.</p>
          ) : (
            companies.map((company) => (
              <div
                key={company.company_id}
                onClick={() => setSelectedCompany(company)}
                style={{
                  background: selectedCompany?.company_id === company.company_id ? "var(--color-background-secondary)" : "var(--color-background-primary)",
                  border: `0.5px solid ${selectedCompany?.company_id === company.company_id ? "var(--color-accent)" : "var(--color-border-tertiary)"}`,
                  borderRadius: "var(--border-radius-lg)",
                  padding: "14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
                      {company.name}
                    </h3>
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 6px", fontFamily: "var(--font-mono)" }}>
                      {truncate(company.company_id, 16)}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0" }}>
                      {company.employees_count} employee{company.employees_count !== 1 ? "s" : ""} • Balance: {company.balance}
                    </p>
                  </div>
                  {company.owner === walletAddress && (
                    <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-success)", color: "var(--color-text-success)" }}>
                      Owner
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ADD EMPLOYEES */}
      {tab === "employees" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedCompany ? (
            <div style={{ padding: "20px", textAlign: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", color: "var(--color-text-secondary)" }}>
              <p>Go to "My Companies" tab and select a company first</p>
            </div>
          ) : (
            <>
              <div style={{ background: "var(--color-background-secondary)", padding: "14px", borderRadius: "var(--border-radius-lg)", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>Selected Company:</p>
                <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0" }}>
                  {selectedCompany.name}
                </h3>
              </div>

              <div>
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                  Employee Address
                </label>
                <input
                  value={employeeAddress}
                  onChange={(e) => setEmployeeAddress(e.target.value)}
                  placeholder="0x..."
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 13, marginBottom: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                  Role
                </label>
                <select
                  value={employeeRole}
                  onChange={(e) => setEmployeeRole(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", marginBottom: "12px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", color: "var(--color-text-primary)" }}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </div>

              <button onClick={handleAddEmployee} disabled={loading}>
                {loading ? "Adding..." : "➕ Add Employee"}
              </button>

              {status && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--border-radius-md)",
                    fontSize: 13,
                    background: status.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
                    color: status.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
                    border: `0.5px solid ${status.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
                  }}
                >
                  {status.msg}
                </div>
              )}

              {/* Employees List */}
              <div style={{ marginTop: "20px" }}>
                <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 12px" }}>
                  Employees ({selectedCompany.employees_count})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedCompany.employees && Object.entries(selectedCompany.employees).map(([addr, info]) => (
                    <div key={addr} style={{ background: "var(--color-background-secondary)", padding: "10px 14px", borderRadius: "var(--border-radius-md)", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                          {truncate(addr, 10)}
                        </span>
                        <span style={{ padding: "2px 8px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-tertiary)", color: "var(--color-accent)", fontSize: 11, fontWeight: 500 }}>
                          {info.role}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", color: "var(--color-text-tertiary)", fontSize: 11 }}>
                        Joined: {new Date(info.joined_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* APPROVAL RULES */}
      {tab === "approvals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedCompany ? (
            <div style={{ padding: "20px", textAlign: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", color: "var(--color-text-secondary)" }}>
              <p>Go to "My Companies" tab and select a company first</p>
            </div>
          ) : selectedCompany.owner !== walletAddress ? (
            <div style={{ padding: "20px", textAlign: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", color: "var(--color-text-secondary)" }}>
              <p>Only the company owner can set approval rules</p>
            </div>
          ) : (
            <>
              <div style={{ background: "var(--color-background-secondary)", padding: "14px", borderRadius: "var(--border-radius-lg)", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>Selected Company:</p>
                <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0" }}>
                  {selectedCompany.name}
                </h3>
              </div>

              <div>
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                  Approval Threshold (amounts above this require approval)
                </label>
                <input
                  type="number"
                  value={approvalThreshold}
                  onChange={(e) => setApprovalThreshold(e.target.value)}
                  placeholder="1000"
                  min="0"
                  style={{ width: "100%", boxSizing: "border-box", marginBottom: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
                  Required Approver Roles
                </label>
                <div style={{ display: "flex", gap: 8, marginBottom: "12px", flexWrap: "wrap" }}>
                  {["owner", "manager"].map((role) => (
                    <label key={role} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={approvalRoles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setApprovalRoles([...approvalRoles, role]);
                          } else {
                            setApprovalRoles(approvalRoles.filter((r) => r !== role));
                          }
                        }}
                      />
                      <span style={{ fontSize: 13, color: "var(--color-text-primary)", textTransform: "capitalize" }}>
                        {role}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 12px" }}>
                {approvalThreshold ? `Transactions over ${approvalThreshold} coins` : "All transactions"} will require approval from: {approvalRoles.length > 0 ? approvalRoles.join(", ") : "none selected"}
              </p>

              <button onClick={handleSetApprovalRules} disabled={loading}>
                {loading ? "Saving..." : "✓ Save Approval Rules"}
              </button>

              {status && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--border-radius-md)",
                    fontSize: 13,
                    background: status.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
                    color: status.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
                    border: `0.5px solid ${status.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
                  }}
                >
                  {status.msg}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PENDING APPROVALS */}
      {tab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedCompany ? (
            <div style={{ padding: "20px", textAlign: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", color: "var(--color-text-secondary)" }}>
              <p>Go to "My Companies" tab and select a company first</p>
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", color: "var(--color-text-secondary)" }}>
              <p>No pending approvals</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
                Threshold: {approvalThreshold} coins • Required roles: {approvalRoles.join(", ")}
              </p>
              {pendingApprovals.map((approval) => (
                <div key={approval.tx_id} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
                        {truncate(approval.transaction.sender, 10)} → {truncate(approval.transaction.receiver, 10)}
                      </h4>
                      <p style={{ fontSize: 13, color: "var(--color-text-accent)", margin: "0 0 4px", fontWeight: 500 }}>
                        {approval.transaction.amount} coins
                      </p>
                      <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0", fontFamily: "var(--font-mono)" }}>
                        ID: {truncate(approval.tx_id, 16)}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: "var(--border-radius-md)",
                      background: approval.status === "approved" ? "var(--color-background-success)" : approval.status === "rejected" ? "var(--color-background-danger)" : "var(--color-background-info)",
                      color: approval.status === "approved" ? "var(--color-text-success)" : approval.status === "rejected" ? "var(--color-text-danger)" : "var(--color-text-info)",
                      fontWeight: 500,
                      textTransform: "capitalize"
                    }}>
                      {approval.status}
                    </span>
                  </div>

                  {/* Approvals Progress */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "12px" }}>
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0" }}>
                      Approvals: {Object.keys(approval.approvals).length} / {approval.required_approvers.length}
                    </p>
                    {approval.required_approvers.map((role) => {
                      const approvals = Object.entries(approval.approvals);
                      const approvalFromRole = approvals.find(([_, decision]) => decision && approval.transaction);
                      return (
                        <div key={role} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <span style={{ flex: 1, color: "var(--color-text-secondary)", textTransform: "capitalize" }}>
                            {role}:
                          </span>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "var(--border-radius-md)",
                            fontSize: 11,
                            background: Object.values(approval.approvals).includes("approved") ? "var(--color-background-success)" : "var(--color-background-tertiary)",
                            color: Object.values(approval.approvals).includes("approved") ? "var(--color-text-success)" : "var(--color-text-tertiary)",
                          }}>
                            {Object.values(approval.approvals).includes("approved") ? "✓ Approved" : "Pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Approve/Reject Buttons */}
                  {approval.status === "pending" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleApproveTransaction(approval.tx_id, "approved")}
                        disabled={loading}
                        style={{
                          flex: 1,
                          background: "var(--color-background-success)",
                          color: "var(--color-text-success)",
                          border: "0.5px solid var(--color-border-success)",
                          padding: "8px 12px",
                          borderRadius: "var(--border-radius-md)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => handleApproveTransaction(approval.tx_id, "rejected")}
                        disabled={loading}
                        style={{
                          flex: 1,
                          background: "var(--color-background-danger)",
                          color: "var(--color-text-danger)",
                          border: "0.5px solid var(--color-border-danger)",
                          padding: "8px 12px",
                          borderRadius: "var(--border-radius-md)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        ✗ Reject
                      </button>
                    </div>
                  )}

                  {status && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--border-radius-md)",
                        fontSize: 12,
                        background: status.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
                        color: status.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
                        border: `0.5px solid ${status.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
                        marginTop: "8px"
                      }}
                    >
                      {status.msg}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

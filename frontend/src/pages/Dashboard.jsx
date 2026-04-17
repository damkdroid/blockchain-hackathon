import { useState, useEffect, useCallback } from "react";
import CompanyManager from "./CompanyManager";

const NODE_URL = "http://127.0.0.1:5000";

function truncate(str, n = 12) {
  if (!str) return "—";
  if (str.length <= n * 2 + 3) return str;
  return str.slice(0, n) + "..." + str.slice(-n);
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// File Transfer Component
function FileTransferTab({ nodeUrl, walletAddress, publicKey, selectedCompanyId, companies, truncate }) {
  const [file, setFile] = useState(null);
  const [receiver, setReceiver] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setFileHash("");
    setStatus(null);
  };

  const handleUploadAndSend = async () => {
    if (!walletAddress || !publicKey) {
      setStatus({ ok: false, msg: "Not logged in with wallet" });
      return;
    }

    if (!file) {
      setStatus({ ok: false, msg: "Please select a file" });
      return;
    }

    if (!receiver.trim()) {
      setStatus({ ok: false, msg: "Please enter recipient address" });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      // Step 1: Upload file to calculate hash (no storage)
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`${nodeUrl}/upload_file`, {
        method: "POST",
        body: formData
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "File hash calculation failed");
      }

      const uploadData = await uploadRes.json();
      setFileHash(uploadData.file_hash);

      // Step 2: Send file hash transaction to blockchain
      const fileTransactionData = {
        sender: walletAddress,
        receiver: receiver.trim(),
        file_name: uploadData.file_name,
        file_hash: uploadData.file_hash,
        file_size: uploadData.file_size,
        company_id: selectedCompanyId || null,
        sender_public_key: publicKey
      };

      const txRes = await fetch(`${nodeUrl}/send_file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileTransactionData)
      });

      if (!txRes.ok) {
        const err = await txRes.json();
        throw new Error(err.error || "File transaction failed");
      }

      setStatus({ ok: true, msg: `File sent! Hash recorded on blockchain: ${uploadData.file_hash.substring(0, 16)}...` });
      setFile(null);
      setReceiver("");
      setFileHash("");

    } catch (e) {
      setStatus({ ok: false, msg: `Error: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Select file to send</label>
        <input
          type="file"
          onChange={handleFileSelect}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
        />
        {file && (
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>
            Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </p>
        )}
      </div>

      {fileHash && (
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all", padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: "4px" }}>
          Hash: {fileHash}
        </div>
      )}

      <div>
        <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Recipient address</label>
        <input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          placeholder="0x..."
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 13, padding: "8px 10px", borderRadius: "4px" }}
        />
      </div>

      {selectedCompanyId && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: "4px" }}>
          Company: {companies.find(c => c.company_id === selectedCompanyId)?.name || "Unknown"}
        </div>
      )}

      <button
        onClick={handleUploadAndSend}
        disabled={loading || !file}
        style={{ marginTop: 4 }}
      >
        {loading ? "Uploading & sending..." : "Send File"}
      </button>

      {status && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "var(--border-radius-md)",
          fontSize: 13,
          background: status.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
          color: status.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
          border: `0.5px solid ${status.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
          wordBreak: "break-word"
        }}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

// Received Files Component
function ReceivedFilesTab({ nodeUrl, walletAddress, truncate }) {
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState({});

  useEffect(() => {
    if (!walletAddress) return;
    
    const fetchFiles = async () => {
      try {
        const res = await fetch(`${nodeUrl}/get_received_files/${walletAddress}`);
        const data = await res.json();
        setReceivedFiles(data || []);
      } catch (e) {
        console.error("Failed to fetch received files:", e);
      }
    };

    fetchFiles();
    const interval = setInterval(fetchFiles, 10000);
    return () => clearInterval(interval);
  }, [walletAddress, nodeUrl]);

  const handleVerifyFile = async (file, fileInput) => {
    if (!fileInput.files[0]) {
      setVerificationStatus(prev => ({
        ...prev,
        [file.file_name]: { ok: false, msg: "No file selected" }
      }));
      return;
    }

    setLoading(true);
    setVerificationStatus(prev => ({
      ...prev,
      [file.file_name]: { ok: null, msg: "Verifying..." }
    }));

    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("expected_hash", file.file_hash);

      const res = await fetch(`${nodeUrl}/verify_file`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.verified) {
        setVerificationStatus(prev => ({
          ...prev,
          [file.file_name]: { ok: true, msg: "File verified! Hash matches blockchain record." }
        }));
      } else {
        setVerificationStatus(prev => ({
          ...prev,
          [file.file_name]: { ok: false, msg: `Hash mismatch!\nExpected: ${data.expected}\nActual: ${data.actual}` }
        }));
      }
    } catch (e) {
      setVerificationStatus(prev => ({
        ...prev,
        [file.file_name]: { ok: false, msg: `Verification error: ${e.message}` }
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {receivedFiles.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>No files received yet.</p>
      ) : (
        receivedFiles.map((file, idx) => {
          const fileInputId = `file-input-${idx}`;
          const status = verificationStatus[file.file_name];

          return (
            <div key={idx} style={{
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
                    {file.file_name}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
                    From: {truncate(file.sender, 8)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>
                    {(file.file_size / 1024).toFixed(2)} KB
                  </p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                    {file.confirmed ? "[OK] Confirmed" : "[PENDING]"}
                  </p>
                </div>
              </div>

              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all", marginBottom: 4, padding: "6px 8px", background: "var(--color-background-primary)", borderRadius: "3px" }}>
                Hash: {file.file_hash.substring(0, 16)}...{file.file_hash.substring(file.file_hash.length - 16)}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id={fileInputId}
                  type="file"
                  onChange={() => {}}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={() => {
                    const fileInput = document.getElementById(fileInputId);
                    handleVerifyFile(file, fileInput);
                  }}
                  disabled={loading}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    background: "var(--color-background-primary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: "var(--color-text-primary)",
                    whiteSpace: "nowrap"
                  }}
                >
                  {loading ? "Verifying..." : "Verify"}
                </button>
              </div>

              {status && (
                <div style={{
                  padding: "8px 10px",
                  borderRadius: "4px",
                  fontSize: 11,
                  background: status.ok === true ? "var(--color-background-success)" : status.ok === false ? "var(--color-background-danger)" : "var(--color-background-primary)",
                  color: status.ok === true ? "var(--color-text-success)" : status.ok === false ? "var(--color-text-danger)" : "var(--color-text-primary)",
                  border: status.ok === true ? "0.5px solid var(--color-border-success)" : status.ok === false ? "0.5px solid var(--color-border-danger)" : "0.5px solid var(--color-border-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word"
                }}>
                  {status.msg}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState("send");
  const [chain, setChain] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [nodeUrl, setNodeUrl] = useState(NODE_URL);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const walletAddress =
    typeof window !== "undefined" ? localStorage.getItem("walletAddress") : null;
  const publicKey =
    typeof window !== "undefined" ? localStorage.getItem("publicKey") : null;

  const fetchCompanies = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`${nodeUrl}/companies`);
      const companiesList = await res.json();
      setCompanies(companiesList || []);
      // Auto-select first company or user's company
      if (companiesList && companiesList.length > 0) {
        const userCompany = companiesList.find(c => c.owner === walletAddress);
        setSelectedCompanyId(userCompany?.company_id || companiesList[0].company_id);
      }
    } catch (e) {
      console.error("Company fetch failed:", e);
    }
  }, [walletAddress, nodeUrl]);

  const fetchChain = useCallback(async () => {
    try {
      const res = await fetch(`${nodeUrl}/chain`);
      const data = await res.json();
      setChain(data);
    } catch (e) {
      console.error("Chain fetch failed:", e);
    }
  }, [nodeUrl]);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${nodeUrl}/get_transactions`);
      const data = await res.json();
      setPending(data);
    } catch (e) {
      console.error("Pending fetch failed:", e);
    }
  }, [nodeUrl]);

  useEffect(() => {
    fetchCompanies();
    fetchChain();
    fetchPending();
    const interval = setInterval(() => {
      fetchChain();
      fetchPending();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchChain, fetchPending, fetchCompanies]);

  const myTxs = [
    ...chain.flatMap((block) =>
      block.transactions
        .filter(
          (tx) => tx.sender === walletAddress || tx.receiver === walletAddress
        )
        .map((tx) => ({ ...tx, confirmed: true, blockHash: block.hash }))
    ),
    ...pending
      .filter(
        (tx) => tx.sender === walletAddress || tx.receiver === walletAddress
      )
      .map((tx) => ({ ...tx, confirmed: false })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const balance = chain
    .flatMap((b) => b.transactions)
    .reduce((acc, tx) => {
      if (tx.receiver === walletAddress) acc += tx.amount;
      if (tx.sender === walletAddress) acc -= tx.amount;
      return acc;
    }, 0);

  const handleSend = async () => {
    if (!walletAddress || !publicKey) {
      setSendStatus({ ok: false, msg: "Not logged in with wallet" });
      return;
    }
    if (!selectedCompanyId) {
      setSendStatus({ ok: false, msg: "Please select a company" });
      return;
    }
    if (!receiver.trim() || !amount || parseFloat(amount) <= 0) {
      setSendStatus({ ok: false, msg: "Fill in all fields correctly" });
      return;
    }

    setLoading(true);
    setSendStatus(null);

    try {
      // Create transaction data ONCE - use same timestamp for both signing and sending
      const txData = {
        sender: walletAddress,
        receiver: receiver.trim(),
        amount: parseFloat(amount),
        timestamp: Math.floor(Date.now() / 1000),
        company_id: selectedCompanyId,
        role: "employee"
      };

      // Sign the transaction
      const challenge = JSON.stringify(txData);
      const id = Date.now();

      window.postMessage({
        type: "WALLET_SIGNIN",
        challenge,
        id
      }, "*");

      const authData = await new Promise((resolve, reject) => {
        const handler = (event) => {
          if (
            event.data.type === "WALLET_SIGNIN_RESPONSE" &&
            event.data.id === id
          ) {
            window.removeEventListener("message", handler);
            if (event.data.success) resolve(event.data.data);
            else reject(new Error(event.data.error || "Denied"));
          }
        };
        window.addEventListener("message", handler);
        setTimeout(() => reject(new Error("Timeout")), 30000);
      });

      // Send the SAME transaction data with signature
      const txToSubmit = {
        ...txData,
        signature: authData.signature,
        sender_public_key: publicKey,
      };

      const res = await fetch(`${nodeUrl}/add_transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(txToSubmit),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setSendStatus({ ok: true, msg: "Transaction submitted!" });
      setReceiver("");
      setAmount("");
      setTimeout(() => {
        fetchPending
      }, 1000);
    } catch (e) {
      setSendStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFundAccount = async () => {
    if (!walletAddress) {
      setSendStatus({ ok: false, msg: "Sign in first" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${nodeUrl}/fund_account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          amount: 1000
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSendStatus({ ok: true, msg: "✓ Account funded with 1000 coins!" });
      setTimeout(() => {
        fetchChain();
        fetchPending();
      }, 1000);
    } catch (e) {
      setSendStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  const tabs = ["send", "files", "received", "history", "chain", "company"];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "var(--font-sans)" }}>
      <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
        Blockchain wallet
      </h2>
      {walletAddress ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.5rem", fontFamily: "var(--font-mono)" }}>
          {truncate(walletAddress, 16)}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: "0 0 1.5rem" }}>
          Not signed in — sign in with wallet first
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { label: "Balance", value: `${balance.toFixed(4)} coins` },
          { label: "Confirmed txs", value: myTxs.filter((t) => t.confirmed).length },
          { label: "Pending", value: pending.length },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 0 }}>
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
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Company</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 4px", fontSize: 13 }}
            >
              <option value="">-- Select a company --</option>
              {companies.map((company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.name} ({truncate(company.company_id)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Recipient address</label>
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="0x..."
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.0001"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Node URL</label>
            <input
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? "Signing & sending..." : "Send transaction"}
          </button>
          <button
            onClick={handleFundAccount}
            disabled={loading}
            style={{ marginTop: 4, background: "var(--color-background-success)", color: "var(--color-text-success)" }}
          >
            {loading ? "Funding..." : "Fund Account (1000 coins)"}
          </button>
          {sendStatus && (
            <div style={{
              padding: "10px 14px",
              borderRadius: "var(--border-radius-md)",
              fontSize: 13,
              background: sendStatus.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
              color: sendStatus.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
              border: `0.5px solid ${sendStatus.ok ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
            }}>
              {sendStatus.msg}
            </div>
          )}
        </div>
      )}

      {tab === "files" && (
        <FileTransferTab nodeUrl={nodeUrl} walletAddress={walletAddress} publicKey={publicKey} selectedCompanyId={selectedCompanyId} companies={companies} truncate={truncate} />
      )}

      {tab === "received" && (
        <ReceivedFilesTab nodeUrl={nodeUrl} walletAddress={walletAddress} truncate={truncate} />
      )}

      {tab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {myTxs.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>No transactions yet.</p>
          )}
          {myTxs.map((tx, i) => {
            const isSent = tx.sender === walletAddress;
            return (
              <div key={i} style={{
                background: "var(--color-background-primary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-lg)",
                padding: "12px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: "var(--border-radius-md)",
                      fontWeight: 500,
                      background: isSent ? "var(--color-background-warning)" : "var(--color-background-success)",
                      color: isSent ? "var(--color-text-warning)" : "var(--color-text-success)",
                    }}>
                      {isSent ? "Sent" : "Received"}
                    </span>
                    {!tx.confirmed && (
                      <span style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: "var(--border-radius-md)",
                        background: "var(--color-background-info)",
                        color: "var(--color-text-info)",
                      }}>pending</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {isSent ? `To: ${truncate(tx.receiver, 10)}` : `From: ${truncate(tx.sender, 10)}`}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {timeAgo(tx.timestamp)}
                  </p>
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: isSent ? "var(--color-text-warning)" : "var(--color-text-success)",
                }}>
                  {isSent ? "-" : "+"}{parseFloat(tx.amount).toFixed(4)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {tab === "chain" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              {chain.length} blocks
            </p>
            <button onClick={() => { fetchChain(); fetchPending(); }} style={{ fontSize: 13 }}>
              Refresh
            </button>
          </div>
          {[...chain].reverse().map((block, i) => (
            <div key={i} style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Block #{chain.length - 1 - i}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {truncate(block.hash, 10)}
                </span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-text-secondary)" }}>
                {block.transactions.length} transaction{block.transactions.length !== 1 ? "s" : ""}
                {" · "}{timeAgo(block.timestamp)}
              </p>
              {block.transactions.map((tx, j) => (
                <div key={j} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  padding: "4px 0",
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}>
                  <span>{truncate(tx.sender, 8)} → {truncate(tx.receiver, 8)}</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{parseFloat(tx.amount).toFixed(4)}</span>
                </div>
              ))}
              {block.transactions.length === 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>Genesis block</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "company" && <CompanyManager />}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";

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

export default function Dashboard() {
  const [tab, setTab] = useState("send");
  const [chain, setChain] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [nodeUrl, setNodeUrl] = useState(NODE_URL);

  const walletAddress =
    typeof window !== "undefined" ? localStorage.getItem("walletAddress") : null;
  const publicKey =
    typeof window !== "undefined" ? localStorage.getItem("publicKey") : null;

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
    fetchChain();
    fetchPending();
    const interval = setInterval(() => {
      fetchChain();
      fetchPending();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchChain, fetchPending]);

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
        timestamp: Date.now() / 1000
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

  const tabs = ["send", "history", "chain"];

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
    </div>
  );
}

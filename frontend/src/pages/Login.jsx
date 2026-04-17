import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [walletReady, setWalletReady] = useState(false);

  // Check if wallet extension is available
  useEffect(() => {
    const checkWallet = async () => {
      if (window.walletExtension) {
        try {
          const isReady = await window.walletExtension.isReady();
          setWalletReady(isReady);
        } catch (err) {
          console.error('Wallet check failed:', err);
          setWalletReady(false);
        }
      } else {
        setWalletReady(false);
      }
    };

    checkWallet();
  }, []);

const handleWalletSignIn = async () => {
  try {
    setLoading(true);
    setError(null);

    const id = Date.now();

    const challenge = `Sign in to Blockchain App\nTimestamp: ${Date.now()}`;

    // Send request to extension
    window.postMessage({
      type: "WALLET_SIGNIN",
      challenge,
      id
    }, "*");

    // Wait for response
    const response = await new Promise((resolve, reject) => {
      const handler = (event) => {
        if (
          event.data.type === "WALLET_SIGNIN_RESPONSE" &&
          event.data.id === id
        ) {
          window.removeEventListener("message", handler);

if (event.data.success) {
  resolve(event.data.data);
} else {
  reject(new Error(event.data.error || "Failed"));
}
        }
      };

      window.addEventListener("message", handler);

      setTimeout(() => reject(new Error("Timeout")), 30000);
    });

    console.log("✅ Auth success:", response);

    localStorage.setItem("authToken", response.signature);
    localStorage.setItem("walletAddress", response.address);
    localStorage.setItem("publicKey", response.publicKey);

    navigate("/dashboard");

  } catch (err) {
    console.error(err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-background text-on-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-[#1c1b1b] border border-cyan-500/30 rounded-2xl p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-cyan-500/20 p-4 rounded-xl">
                <Shield className="text-cyan-400" size={40} />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white">Sign In</h1>
            <p className="text-zinc-400">
              Use your blockchain wallet to authenticate
            </p>
          </div>

          {/* Wallet Status */}
          <div className={`p-4 rounded-lg ${walletReady ? 'bg-green-500/20 border border-green-500/30' : 'bg-yellow-500/20 border border-yellow-500/30'}`}>
            <p className={`text-sm font-medium ${walletReady ? 'text-green-400' : 'text-yellow-400'}`}>
              {walletReady ? '✓ Wallet extension detected' : '⚠ Wallet extension not detected'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400">❌ {error}</p>
            </div>
          )}

          {/* Sign In Button */}
          <button
            onClick={handleWalletSignIn}
            disabled={!walletReady || loading}
            className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
              walletReady && !loading
                ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <Loader className="animate-spin" size={18} />
                Signing in...
              </>
            ) : (
              <>
                💼 Sign In With Wallet
              </>
            )}
          </button>

          {/* Info */}
          <div className="bg-zinc-900 rounded-lg p-4 space-y-3 text-sm">
            <h3 className="font-semibold text-white">How it works:</h3>
            <ol className="text-zinc-400 space-y-2 list-decimal list-inside">
              <li>Click the button above</li>
              <li>Your wallet extension popup appears</li>
              <li>Review and approve the sign-in</li>
              <li>You're authenticated!</li>
            </ol>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-sm text-zinc-500">
              Need help? Check your wallet extension icon in the top-right
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

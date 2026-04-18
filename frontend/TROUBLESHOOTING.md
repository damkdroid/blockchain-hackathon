# Frontend-Dummy Troubleshooting Guide

## Quick Status Check

### ✅ WORKING CORRECTLY
1. **Login Page** - Demo account login works
2. **Dashboard Tabs UI** - All 6 tabs display correctly
3. **Balance Calculation** - Now includes received funds (FIXED)
4. **API Parameter Format** - Matches backend expectations:
   - send/receiver parameters ✅
   - timestamp parameter ✅
   - sender_public_key parameter ✅

### ⚠️ NEEDS VERIFICATION

## Step 1: Verify Backend is Running

```bash
cd c:\Users\damk1\Documents\blockchain4
python network.py
```

**Expected Output:**
```
 * Running on http://127.0.0.1:5000
 * Press CTRL+C to quit
```

**If not working:**
- Check if Python is installed: `python --version`
- Check if Flask is installed: `pip install flask`
- Check if Flask-CORS is installed: `pip install flask-cors`

---

## Step 2: Test Frontend Login

1. Open: `http://127.0.0.1:5500/frontend-dummy/pages/login.html`
2. Wait for wallet check (5 seconds)
3. Should see: "Wallet extension not detected - use Demo Account"
4. Click "Demo Account" button
5. Should redirect to: `http://127.0.0.1:5500/frontend-dummy/pages/dashboard.html`

**If stuck on wallet check:**
- Open DevTools (F12) → Console
- Look for error messages
- Note any errors for Step 5

---

## Step 3: Test Dashboard - Send Tab

1. Verify wallet address displays (starts with 0x)
2. Verify balance shows (should be 1,000,000 KLT)
3. Enter a test recipient: `0x1234567890abcdef1234567890abcdef12345678`
4. Enter amount: `100`
5. Click "Send Transaction"

**Expected:**
- Toast: "Transaction sent successfully"
- Balance updates after 10 seconds
- History tab shows new transaction

**If error:**
- Open DevTools (F12) → Network tab
- Look for failed requests to `/add_transaction`
- Check response code and body

---

## Step 4: Test Dashboard - Send Files Tab

1. Select any test file (< 1MB)
2. Enter recipient address
3. Click "Send File"

**Expected:**
- Toast: "Calculating file hash..."
- Toast: "File sent successfully!"
- Received tab updates

**If error:**
- Check Network tab for `/upload_file` request
- Check response format

---

## Step 5: Test Dashboard - History Tab

1. After sending a transaction
2. Click "History" tab
3. Should show recent transactions

**Expected:**
- List of transactions
- Proper sender/receiver display
- Amounts in KLT format

---

## Step 6: Test Dashboard - Blockchain Tab

1. Click "Blockchain" tab
2. Should show list of blocks

**Expected:**
- Block numbers visible
- Transaction count per block
- Block hashes

**If empty:**
- Check `/chain` endpoint returns data
- Verify blocks have transactions

---

## Common Issues & Fixes

### Issue 1: "Balance: NaN KLT"
**Cause:** Chain data contains invalid transactions
**Fix:** Update `updateBalance()` to filter:
```javascript
const allTxs = this.chain.flatMap(block => 
    block.transactions?.filter(tx => tx && tx.sender && tx.receiver) || []
);
```
**Status:** ✅ FIXED in latest version

---

### Issue 2: "Transaction failed" Error
**Cause:** Possible reasons:
- Backend validation failure (check Network tab response)
- Missing required fields (sender, receiver, amount, timestamp, signature)
- Invalid sender address format

**Fix:**
1. Check console for error message
2. Verify address format: `0x` + 32 hex characters
3. Ensure amount is > 0

---

### Issue 3: No Data in History/Blockchain Tabs
**Cause:** `/chain` endpoint not returning blocks

**Debug:**
```javascript
// Open console and run:
fetch('http://127.0.0.1:5000/chain')
  .then(r => r.json())
  .then(data => console.log('Chain:', data))
```

**Expected response:**
```json
[
  {
    "index": 0,
    "timestamp": 1234567890,
    "transactions": [
      {"sender": "SYSTEM", "receiver": "0x...", "amount": 1000}
    ],
    "previous_hash": "0",
    "hash": "abc123...",
    "nonce": 0
  }
]
```

---

### Issue 4: "File not found" on Received Tab
**Cause:** `/get_received_files` endpoint not returning data

**Debug:**
```javascript
// Replace ADDRESS with actual wallet address
fetch('http://127.0.0.1:5000/get_received_files/0x...')
  .then(r => r.json())
  .then(data => console.log('Files:', data))
```

**Expected response:**
```json
[
  {
    "file_name": "test.txt",
    "file_hash": "abc123...",
    "file_size": 1024,
    "sender": "0x...",
    "timestamp": 1234567890
  }
]
```

---

## Browser DevTools Commands for Testing

### Test API Endpoints Directly

```javascript
// Test /chain
fetch('http://127.0.0.1:5000/chain').then(r=>r.json()).then(console.log)

// Test /add_transaction
fetch('http://127.0.0.1:5000/add_transaction', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    sender: '0xaaa...',
    receiver: '0xbbb...',
    amount: 100,
    sender_public_key: '-----BEGIN...',
    timestamp: Math.floor(Date.now()/1000),
    signature: ''
  })
}).then(r=>r.json()).then(console.log)

// Test /fund_account
fetch('http://127.0.0.1:5000/fund_account', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    address: '0xaaa...',
    amount: 1000
  })
}).then(r=>r.json()).then(console.log)
```

---

## Verification Checklist

```
[ ] Backend running on http://127.0.0.1:5000
[ ] Login page loads correctly
[ ] Demo account login works
[ ] Dashboard displays wallet address
[ ] Balance displays as number (not NaN)
[ ] Send transaction form works
[ ] Fund account form works
[ ] History tab shows transactions
[ ] Blockchain tab shows blocks
[ ] Received files tab accessible
[ ] No console errors (F12)
[ ] No 404 errors in Network tab
[ ] Audit trail displays timeline
[ ] No "Verified Block" card in audit
[ ] All 6 dashboard tabs work
```

---

## If Still Having Issues

1. **Open DevTools (F12)**
2. **Go to Console tab**
3. **Send a transaction** (to trigger error)
4. **Copy any error messages**
5. **Check Network tab**
6. **Look at request/response**
7. **Compare with expected format**

---

## API Endpoint Quick Reference

| Method | Path | Purpose | Required Fields |
|--------|------|---------|-----------------|
| GET | `/chain` | Get all blocks | - |
| POST | `/add_transaction` | Send KLT | sender, receiver, amount, sender_public_key, timestamp, signature |
| POST | `/fund_account` | Fund wallet | address, amount |
| POST | `/upload_file` | Upload & hash file | file (multipart) |
| POST | `/send_file` | Send file | sender, receiver, file_name, file_hash, file_size, sender_public_key |
| GET | `/get_received_files/{address}` | Get received files | - |
| GET | `/companies` | List companies | - |

---

## Next Steps

1. Run backend: `python network.py`
2. Test login with demo account
3. Go through each dashboard tab
4. Report which features work/fail
5. Use DevTools to collect error messages
6. Update this document with findings

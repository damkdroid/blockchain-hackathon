import requests

NODE_URL = "http://127.0.0.1:5000"

def get_pending_transactions():
    try:
        res = requests.get(f"{NODE_URL}/get_transactions")
        data = res.json()

        print(">> Pending Transactions:\n")

        for i, tx in enumerate(data):
            print(f"--- Transaction {i+1} ---")
            print(f"Sender   : {tx['sender'][:50]}...")
            print(f"Receiver : {tx['receiver'][:50]}...")
            print(f"Amount   : {tx['amount']}")
            print(f"Timestamp: {tx['timestamp']}")
            print()

        return data

    except Exception as e:
        print("❌ Error fetching transactions:", e)
        return []


if __name__ == "__main__":
    get_pending_transactions()
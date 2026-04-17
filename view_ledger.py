import requests

NODE_URL = "http://127.0.0.1:5000"


def view_ledger():
    try:
        res = requests.get(f"{NODE_URL}/chain")
        chain = res.json()

        print("\nFULL BLOCKCHAIN LEDGER\n")
        print("=" * 60)

        for i, block in enumerate(chain):
            print(f"\nBLOCK {i}")
            print("-" * 60)
            print(f"Timestamp     : {block['timestamp']}")
            print(f"Previous Hash : {block['previous_hash']}")
            print(f"Hash          : {block['hash']}")
            print(f"Nonce         : {block['nonce']}")

            print("\n📄 Transactions:")
            if not block['transactions']:
                print("  (No transactions)")
            else:
                for j, tx in enumerate(block['transactions']):
                    print(f"\n  ➤ Transaction {j+1}")
                    print(f"     From  : {tx['sender'][:40]}...")
                    print(f"     To    : {tx['receiver'][:40]}...")
                    print(f"     Amount: {tx['amount']}")
                    print(f"     Time  : {tx['timestamp']}")

        print("\n" + "=" * 60)

    except Exception as e:
        print("Error fetching ledger:", e)


if __name__ == "__main__":
    view_ledger()
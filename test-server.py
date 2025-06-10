#!/usr/bin/env python3
import requests
import sys
import time

def test_server():
    urls_to_test = [
        'http://localhost:3000',
        'http://localhost:3000/ping',
        'http://localhost:3000/api/health',
        'http://localhost:3001',
        'http://localhost:3001/ping'
    ]
    
    for url in urls_to_test:
        try:
            print(f"Testing {url}...")
            response = requests.get(url, timeout=5)
            print(f"  Status: {response.status_code}")
            print(f"  Headers: {dict(response.headers)}")
            if response.text:
                print(f"  Content (first 200 chars): {response.text[:200]}")
            print()
        except requests.exceptions.ConnectionError:
            print(f"  ❌ Connection refused")
        except requests.exceptions.Timeout:
            print(f"  ⏰ Timeout")
        except Exception as e:
            print(f"  ❌ Error: {e}")
        print()

if __name__ == "__main__":
    test_server()
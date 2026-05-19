import requests
try:
    r = requests.get('http://127.0.0.1:5000/test-ping')
    print("Status:", r.status_code)
    print("Body:", r.text)
except Exception as e:
    print("Error:", e)

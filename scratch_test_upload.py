import urllib.request
import json

CSV_DATA = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2024-03-03,1030,Aqua,MODIS,nominal,6.1NRT,305.8,54.0,D
"""

boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
parts = [
    f"--{boundary}",
    'Content-Disposition: form-data; name="file"; filename="test_obs.csv"',
    "Content-Type: text/csv",
    "",
    CSV_DATA.strip(),
    f"--{boundary}--",
    ""
]
body = "\r\n".join(parts).encode("utf-8")

print("1. Testing Port 8000 (Backend Direct)...")
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/v1/inference/upload-and-analyze",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print("Port 8000 Direct status:", resp.status)
        data = json.loads(resp.read().decode("utf-8"))
        print("Success:", data.get("success"))
        print("Total records:", data.get("total_records"))
        print("Prediction:", data.get("prediction"))
except Exception as e:
    print("Port 8000 error:", e)

print("\n2. Testing Port 5173 (Frontend Proxy)...")
req_proxy = urllib.request.Request(
    "http://localhost:5173/api/v1/inference/upload-and-analyze",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
)
try:
    with urllib.request.urlopen(req_proxy, timeout=10) as resp:
        print("Port 5173 Proxy status:", resp.status)
        data = json.loads(resp.read().decode("utf-8"))
        print("Success:", data.get("success"))
        print("Total records:", data.get("total_records"))
        print("Prediction:", data.get("prediction"))
except Exception as e:
    print("Port 5173 proxy error:", e)

print("\n3. Testing predict-and-store on Port 5173...")
obs = {
    "latitude": 22.4707,
    "longitude": 70.0577,
    "brightness": 362.5,
    "bright_t31": 305.8,
    "frp": 54.0,
    "confidence": "high",
    "source": "Aqua",
    "instrument": "MODIS",
    "daynight": "D",
    "acq_date": "2024-03-03",
    "acq_time": "1030"
}
req_single = urllib.request.Request(
    "http://localhost:5173/api/v1/inference/predict-and-store",
    data=json.dumps(obs).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req_single, timeout=10) as resp:
        print("Single predict-and-store status:", resp.status)
        print("Response:", json.loads(resp.read().decode("utf-8")))
except Exception as e:
    print("Single predict error:", e)

import urllib.request
import json

CSV_DATA = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2024-03-03,1030,Aqua,MODIS,nominal,6.1NRT,305.8,54.0,D
"""

boundary = "----WebKitFormBoundaryXYZ"
parts = [
    f"--{boundary}",
    'Content-Disposition: form-data; name="file"; filename="test1.csv"',
    "Content-Type: text/csv",
    "",
    CSV_DATA.strip(),
    f"--{boundary}",
    'Content-Disposition: form-data; name="files"; filename="test1.csv"',
    "Content-Type: text/csv",
    "",
    CSV_DATA.strip(),
    f"--{boundary}--",
    ""
]
body = "\r\n".join(parts).encode("utf-8")

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/v1/inference/upload-and-analyze",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
)
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print("Status with both file and files:", resp.status)
        d = json.loads(resp.read().decode("utf-8"))
        print("Total records parsed:", d.get("total_records"))
except Exception as e:
    print("Error with both:", e)

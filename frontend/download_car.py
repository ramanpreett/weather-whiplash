import urllib.request
import re
import os

url = "https://en.wikipedia.org/wiki/Red_Bull_Racing"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    matches = re.findall(r'//upload\.wikimedia\.org/wikipedia/commons/thumb/[a-zA-Z0-9/_-]+\.jpg/\d+px-[^"]+\.jpg', html)
    if not matches:
        print("No image found!")
    else:
        # Find a decently sized thumbnail (e.g. 500px+)
        target_url = None
        for m in matches:
            if '500px-' in m or '800px-' in m or '1024px-' in m:
                target_url = "https:" + m
                break
        
        if not target_url:
            target_url = "https:" + matches[0]
            
        print(f"Downloading {target_url}")
        img_req = urllib.request.Request(target_url, headers=headers)
        with urllib.request.urlopen(img_req) as img_resp:
            data = img_resp.read()
            os.makedirs('public', exist_ok=True)
            with open('public/hero-car.jpg', 'wb') as f:
                f.write(data)
        print("Successfully downloaded Red Bull image to public/hero-car.jpg")
except Exception as e:
    print(f"Error: {e}")

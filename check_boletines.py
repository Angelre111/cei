import os
import sys
from dotenv import load_dotenv
sys.path.append(os.path.join(os.path.dirname(__file__), 'py'))

load_dotenv()
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

print("Checking boletines columns:")
res = supabase.table('boletines').select('*').limit(1).execute()
if res.data:
    print(res.data[0].keys())
else:
    print(res)

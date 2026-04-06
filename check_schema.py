import os, json
from supabase import create_client

# We know form_registro.py has it set up
url = os.environ.get("SUPABASE_URL") or "https://placeholder" 
key = os.environ.get("SUPABASE_KEY") or "placeholder"
# Let's borrow from py/form_registro.py 
# Actually, I can just grep the SUPABASE_URL inside form_registro.py or import it
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'py'))
from form_registro import supabase
res = supabase.table('boletas_indicadores').select('*').limit(1).execute()
print(json.dumps(res.data))

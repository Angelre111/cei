import os, json
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'py'))
from form_registro import supabase

print("Testing boletines")
try:
    res = supabase.table('boletines').select('*').limit(1).execute()
    print("boletines keys:", json.dumps(res.data))
except Exception as e:
    print("Error in boletines:", e)

print("Testing boletines_indicadores")
try:
    res2 = supabase.table('boletines_indicadores').select('*').limit(1).execute()
    print("boletines_indicadores keys:", json.dumps(res2.data))
except Exception as e:
    print("Error in boletines_indicadores:", e)

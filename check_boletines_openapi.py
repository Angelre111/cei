import requests
import json

url = "https://yfvupxrrvqfwafvozypn.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdnVweHJydnFmd2Fmdm96eXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTUxNzgsImV4cCI6MjA4Njc3MTE3OH0.fiP_c1PGtNYUO4TfwsvtaDyKBAYl798j3QO5ikOUVzc"

try:
    response = requests.get(url)
    data = response.json()
    boletines_schema = data.get("definitions", {}).get("boletines", {})
    cols = boletines_schema.get("properties", {}).keys()
    print("Columnas de boletines:", list(cols))
except Exception as e:
    print(e)

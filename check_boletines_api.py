import requests

url = "https://yfvupxrrvqfwafvozypn.supabase.co/rest/v1/boletines?select=*"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdnVweHJydnFmd2Fmdm96eXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTUxNzgsImV4cCI6MjA4Njc3MTE3OH0.fiP_c1PGtNYUO4TfwsvtaDyKBAYl798j3QO5ikOUVzc",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdnVweHJydnFmd2Fmdm96eXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTUxNzgsImV4cCI6MjA4Njc3MTE3OH0.fiP_c1PGtNYUO4TfwsvtaDyKBAYl798j3QO5ikOUVzc"
}

response = requests.get(url, headers=headers)
print("KEYS:")
if response.json():
    print(response.json()[0].keys())
else:
    print("No rows, but column error. Let's do an OPTIONS request")

response = requests.options(url, headers=headers)
print(response.headers)

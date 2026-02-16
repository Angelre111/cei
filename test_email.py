
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_EMAIL = os.getenv('SMTP_EMAIL')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')

def test_email_sending():
    print(f"Testing with email: {SMTP_EMAIL}")
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print("ERROR: SMTP_EMAIL or SMTP_PASSWORD not set in environment or .env file.")
        return

    destinatario = SMTP_EMAIL  # Send to self for testing
    msg = MIMEMultipart()
    msg['From'] = SMTP_EMAIL
    msg['To'] = destinatario
    msg['Subject'] = "Test Email from Antigravity"
    msg.attach(MIMEText("This is a test email.", 'plain'))

    try:
        print("Connecting to SMTP server...")
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        print("Logging in...")
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        print("Sending message...")
        server.send_message(msg)
        server.quit()
        print("SUCCESS: Email sent successfully!")
        return True
    except Exception as e:
        print(f"ERROR: Error sending email: {e}")
        return False

if __name__ == "__main__":
    test_email_sending()

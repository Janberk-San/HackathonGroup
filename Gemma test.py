from google import genai

client = genai.Client()  # reads GEMINI_API_KEY automatically
resp = client.models.generate_content(
    model="gemma-4-26b-a4b-it",
    contents="Explain gradient boosting in 3 sentences.",
)
print(resp.text)


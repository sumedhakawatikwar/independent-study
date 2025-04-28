from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")
db = client["userRepository"]
collection = db["qas"]

# Fetch all documents
documents = collection.find()

# Start building the LaTeX document
latex_output = r"""\documentclass{article}
\usepackage{enumitem}
\begin{document}

\section*{Quiz}

\begin{enumerate}
"""

# Add questions
for doc in documents:
    questions = doc.get("questions", [])  # <-- Important: get "questions" list
    for q in questions:
        question_text = q.get("question", "No question found")
        options = q.get("options", [])
        correct_answer = q.get("correctAnswer", "No answer provided")
        
        latex_output += f"  \\item {question_text}\n"
        latex_output += "  \\begin{enumerate}[label=(\\alph*)]\n"
        for opt in options:
            option_text = opt.get("option", "No option text")  # <-- "option" field inside
            latex_output += f"    \\item {option_text}\n"
        latex_output += "  \\end{enumerate}\n"
        latex_output += f"  \\textbf{{Answer:}} {correct_answer}\n\n"

latex_output += r"""\end{enumerate}
\end{document}
"""

# Write to .tex file
with open("quiz_questions.tex", "w", encoding="utf-8") as file:
    file.write(latex_output)

print("LaTeX file created: quiz_questions.tex")

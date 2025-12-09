const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://localhost:27017/userRepository', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const qaSchema = new mongoose.Schema({
    title: { type: String, unique: true, required: true },
    questions: [
        {
            question: { type: String, required: true },
            type: { type: String, enum: ['mcq', 'fill in the blank', 'short answer', 'long answer'], required: true },
            options: [
                {
                    option: { type: String, required: true },
                    isCorrect: { type: Boolean, required: true }
                }
            ],
            correctAnswer: { type: String, required: true }  
        }
    ]
});

const QA = mongoose.model('QA', qaSchema);

// Create new repository
app.post('/create-repo', async (req, res) => {
    const { title } = req.body;
    try {
        const existingQA = await QA.findOne({ title });
        if (existingQA) {
            return res.status(400).json({ message: 'Document already exists' });
        }

        const newQA = new QA({ title, questions: [] });
        await newQA.save();
        res.json({ qa: newQA });
    } catch (error) {
        res.status(500).json({ message: 'Error creating document', error: error.message });
    }
});

// Load repository
app.get('/load-repo', async (req, res) => {
    const { repoName } = req.query;
    try {
        const qa = await QA.findOne({ title: repoName });
        if (!qa) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json({ qa });
    } catch (error) {
        res.status(500).json({ message: 'Error loading document', error: error.message });
    }
});

// Add QnA
app.post('/add-qna', async (req, res) => {
    const { repoTitle, question, questionType, options, correctAnswer } = req.body;

    if (!repoTitle || !question || !questionType || !correctAnswer) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // For MCQ type, we ensure the options are also included
    if (questionType === 'mcq' && !options) {
        return res.status(400).json({ message: 'Options are required for MCQ' });
    }

    try {
        const newQuestion = {
            question,
            type: questionType,
            correctAnswer
        };

        if (questionType === 'mcq') {
            newQuestion.options = options; // Store the options for MCQ type
        }

        const qa = await QA.findOneAndUpdate(
            { title: repoTitle },
            { $push: { questions: newQuestion } },
            { new: true }
        );

        if (!qa) {
            return res.status(404).json({ message: 'Repository not found' });
        }

        res.json({ message: 'Question added successfully', qa });
    } catch (error) {
        res.status(500).json({ message: 'Error adding QnA', error: error.message });
    }
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

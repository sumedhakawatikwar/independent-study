const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'quizforge-secret-key-2024';

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, '../Frontend')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files allowed'), false),
    limits: { fileSize: 100 * 1024 * 1024 }
});

mongoose.connect('mongodb://localhost:27017/quizGenerator')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('❌ MongoDB error:', err.message));

// ==================== SCHEMAS ====================

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'professor', 'admin'], required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const quizSchema = new mongoose.Schema({
    title: { type: String, required: true },
    difficulty: { type: String, default: 'medium' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    professorName: { type: String },
    isPublished: { type: Boolean, default: true },
    mcqQuestions: [{
        question: String,
        options: [{ text: String, isCorrect: Boolean }],
        explanation: String
    }],
    tfQuestions: [{
        question: String,
        answer: Boolean,
        explanation: String
    }],
    whQuestions: [{
        question: String,
        answer: String
    }],
    createdAt: { type: Date, default: Date.now }
});

const Quiz = mongoose.model('Quiz', quizSchema);

// Quiz Attempt Schema - tracks student attempts
const attemptSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    percentage: { type: Number, required: true },
    answers: { type: Object },
    completedAt: { type: Date, default: Date.now }
});

const Attempt = mongoose.model('Attempt', attemptSchema);

// ==================== MIDDLEWARE ====================

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied for your role' });
    }
    next();
};

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });
        
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'Email already registered' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role });
        await user.save();
        
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        if (user.role !== role) return res.status(400).json({ error: `Account not registered as ${role}` });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== HELPER FUNCTIONS ====================

async function generateWithGroq(prompt) {
    const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4000
    });
    return completion.choices[0]?.message?.content || '';
}

// ==================== PROFESSOR ROUTES ====================

// Upload PDF
app.post('/api/professor/upload-pdf', authenticateToken, requireRole('professor', 'admin'), upload.single('pdf'), async (req, res) => {
    let pdfPath = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
        
        pdfPath = req.file.path;
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfData = await pdfParse(pdfBuffer);
        const cleanedText = pdfData.text.replace(/\s+/g, ' ').trim();
        
        fs.unlinkSync(pdfPath);
        
        if (cleanedText.length < 10) return res.status(400).json({ error: 'Could not extract text' });
        
        res.json({ success: true, text: cleanedText, fileName: req.file.originalname, pageCount: pdfData.numpages });
    } catch (error) {
        if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// Create Quiz
app.post('/api/professor/create-quiz', authenticateToken, requireRole('professor', 'admin'), async (req, res) => {
    try {
        const { text, title, mcqCount = 0, tfCount = 0, whCount = 0, difficulty = 'medium' } = req.body;
        if (!text) return res.status(400).json({ error: 'No text provided' });

        const textContent = text.substring(0, 50000);
        const promises = [];
        
        if (mcqCount > 0) {
            promises.push(generateWithGroq(`Generate ${mcqCount} ${difficulty} MCQ questions with 4 options from this text. Return JSON: [{"question":"...","options":[{"text":"...","isCorrect":true/false}],"explanation":"..."}]\n\nText:\n${textContent}`));
        }
        if (tfCount > 0) {
            promises.push(generateWithGroq(`Generate ${tfCount} ${difficulty} True/False questions from this text. Return JSON: [{"question":"...","answer":true/false,"explanation":"..."}]\n\nText:\n${textContent}`));
        }
        if (whCount > 0) {
            promises.push(generateWithGroq(`Generate ${whCount} ${difficulty} WH questions from this text. Return JSON: [{"question":"...","answer":"..."}]\n\nText:\n${textContent}`));
        }

        const results = await Promise.all(promises);
        let idx = 0;
        let mcqQuestions = [], tfQuestions = [], whQuestions = [];
        
        if (mcqCount > 0) {
            const match = results[idx++].match(/\[[\s\S]*\]/);
            mcqQuestions = match ? JSON.parse(match[0]) : [];
        }
        if (tfCount > 0) {
            const match = results[idx++].match(/\[[\s\S]*\]/);
            tfQuestions = match ? JSON.parse(match[0]) : [];
        }
        if (whCount > 0) {
            const match = results[idx++].match(/\[[\s\S]*\]/);
            whQuestions = match ? JSON.parse(match[0]) : [];
        }

        const quiz = new Quiz({
            title: title || 'Untitled Quiz',
            difficulty,
            createdBy: req.user.id,
            professorName: req.user.name,
            mcqQuestions,
            tfQuestions,
            whQuestions
        });

        await quiz.save();
        res.json({ success: true, quiz });
    } catch (error) {
        console.error('Quiz creation error:', error);
        res.status(500).json({ error: 'Failed to create quiz' });
    }
});

// Get professor's quizzes
app.get('/api/professor/quizzes', authenticateToken, requireRole('professor', 'admin'), async (req, res) => {
    try {
        const quizzes = await Quiz.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
        
        // Get attempt counts for each quiz
        const quizzesWithStats = await Promise.all(quizzes.map(async (quiz) => {
            const attemptCount = await Attempt.countDocuments({ quiz: quiz._id });
            const attempts = await Attempt.find({ quiz: quiz._id });
            const avgScore = attempts.length > 0 
                ? Math.round(attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length)
                : 0;
            
            return {
                ...quiz.toObject(),
                attemptCount,
                avgScore
            };
        }));
        
        res.json({ success: true, quizzes: quizzesWithStats });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
});

// Delete quiz
app.delete('/api/professor/quiz/:id', authenticateToken, requireRole('professor', 'admin'), async (req, res) => {
    try {
        const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        await Attempt.deleteMany({ quiz: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete quiz' });
    }
});

// ==================== STUDENT ROUTES ====================

// Get available quizzes for students
app.get('/api/student/quizzes', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const quizzes = await Quiz.find({ isPublished: true })
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        
        // Check which quizzes student has attempted
        const attempts = await Attempt.find({ student: req.user.id });
        const attemptedQuizIds = attempts.map(a => a.quiz.toString());
        
        const quizzesWithStatus = quizzes.map(quiz => ({
            ...quiz.toObject(),
            attempted: attemptedQuizIds.includes(quiz._id.toString()),
            questionCount: (quiz.mcqQuestions?.length || 0) + (quiz.tfQuestions?.length || 0) + (quiz.whQuestions?.length || 0)
        }));
        
        res.json({ success: true, quizzes: quizzesWithStatus });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
});

// Get single quiz for taking
app.get('/api/student/quiz/:id', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id).populate('createdBy', 'name');
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        res.json({ success: true, quiz });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quiz' });
    }
});

// Submit quiz attempt
app.post('/api/student/submit-quiz', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { quizId, answers, score, totalQuestions } = req.body;
        
        const attempt = new Attempt({
            student: req.user.id,
            quiz: quizId,
            score,
            totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            answers
        });
        
        await attempt.save();
        res.json({ success: true, attempt });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit quiz' });
    }
});

// Get student's attempts/results
app.get('/api/student/attempts', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const attempts = await Attempt.find({ student: req.user.id })
            .populate('quiz', 'title difficulty professorName')
            .sort({ completedAt: -1 });
        
        res.json({ success: true, attempts });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

// Get student stats
app.get('/api/student/stats', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const attempts = await Attempt.find({ student: req.user.id });
        const totalQuizzes = attempts.length;
        const avgScore = totalQuizzes > 0 
            ? Math.round(attempts.reduce((sum, a) => sum + a.percentage, 0) / totalQuizzes)
            : 0;
        const bestScore = totalQuizzes > 0 
            ? Math.max(...attempts.map(a => a.percentage))
            : 0;
        
        res.json({ success: true, stats: { totalQuizzes, avgScore, bestScore } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ==================== PAGE ROUTES ====================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/login.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/dashboard.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/dashboard.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

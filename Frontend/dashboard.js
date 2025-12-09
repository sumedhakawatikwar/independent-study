const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin;

// State
let currentUser = null;
let extractedText = '';
let currentQuiz = null;
let userAnswers = {};
let counts = { mcq: 5, tf: 5, wh: 5 };

// Auth check
function checkAuth() {
    const token = localStorage.getItem('quizforge_token');
    const user = localStorage.getItem('quizforge_user');
    if (!token || !user) {
        window.location.href = window.location.protocol === 'file:' ? 'login.html' : '/login';
        return null;
    }
    return JSON.parse(user);
}

function getToken() {
    return localStorage.getItem('quizforge_token');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    currentUser = checkAuth();
    if (!currentUser) return;

    setupUI();
    setupEventListeners();

    if (currentUser.role === 'professor' || currentUser.role === 'admin') {
        showProfessorDashboard();
    } else {
        showStudentDashboard();
    }
});

function setupUI() {
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
    document.getElementById('userRole').className = 'user-role ' + currentUser.role;
}

function setupEventListeners() {
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('quizforge_token');
        localStorage.removeItem('quizforge_user');
        window.location.href = window.location.protocol === 'file:' ? 'login.html' : '/login';
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            const parent = tab.closest('.dashboard');
            parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabName + 'Tab').classList.add('active');
        });
    });

    // Upload zone
    const uploadZone = document.getElementById('uploadZone');
    const pdfInput = document.getElementById('pdfInput');
    
    if (uploadZone) {
        uploadZone.addEventListener('click', () => pdfInput.click());
        uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent-primary)'; });
        uploadZone.addEventListener('dragleave', () => uploadZone.style.borderColor = '');
        uploadZone.addEventListener('drop', e => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            if (e.dataTransfer.files[0]?.type === 'application/pdf') handlePdfUpload(e.dataTransfer.files[0]);
        });
    }
    
    if (pdfInput) {
        pdfInput.addEventListener('change', e => {
            if (e.target.files[0]) handlePdfUpload(e.target.files[0]);
        });
    }

    // Remove file
    document.getElementById('removeFile')?.addEventListener('click', () => {
        extractedText = '';
        document.getElementById('uploadZone').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('quizOptions').style.display = 'none';
    });

    // Counter buttons
    document.querySelectorAll('.counter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const action = btn.dataset.action;
            if (action === 'inc' && counts[target.replace('Count', '')] < 15) counts[target.replace('Count', '')]++;
            if (action === 'dec' && counts[target.replace('Count', '')] > 1) counts[target.replace('Count', '')]--;
            document.getElementById(target).textContent = counts[target.replace('Count', '')];
        });
    });

    // Generate quiz
    document.getElementById('generateBtn')?.addEventListener('click', generateQuiz);

    // Back buttons
    document.getElementById('backToList')?.addEventListener('click', () => {
        document.getElementById('quizView').style.display = 'none';
        document.getElementById('studentDashboard').style.display = 'block';
    });

    document.getElementById('backToDashboard')?.addEventListener('click', () => {
        document.getElementById('resultView').style.display = 'none';
        if (currentUser.role === 'student') {
            showStudentDashboard();
        }
    });

    // Submit quiz
    document.getElementById('submitQuizBtn')?.addEventListener('click', submitQuiz);
}

// ==================== PROFESSOR FUNCTIONS ====================

function showProfessorDashboard() {
    document.getElementById('professorDashboard').style.display = 'block';
    document.getElementById('studentDashboard').style.display = 'none';
    loadProfessorQuizzes();
}

async function handlePdfUpload(file) {
    const formData = new FormData();
    formData.append('pdf', file);

    showLoading('Extracting text from PDF...');

    try {
        const res = await fetch(`${API_BASE}/api/professor/upload-pdf`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getToken() },
            body: formData
        });

        const data = await res.json();
        hideLoading();

        if (!res.ok) throw new Error(data.error);

        extractedText = data.text;
        document.getElementById('uploadZone').style.display = 'none';
        document.getElementById('fileInfo').style.display = 'flex';
        document.getElementById('fileName').textContent = data.fileName;
        document.getElementById('quizOptions').style.display = 'block';

    } catch (error) {
        hideLoading();
        alert('Error: ' + error.message);
    }
}

async function generateQuiz() {
    const title = document.getElementById('quizTitle').value || 'Untitled Quiz';
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    const mcqEnabled = document.getElementById('mcqEnabled').checked;
    const tfEnabled = document.getElementById('tfEnabled').checked;
    const whEnabled = document.getElementById('whEnabled').checked;

    if (!mcqEnabled && !tfEnabled && !whEnabled) {
        alert('Please select at least one question type');
        return;
    }

    showLoading('Generating quiz questions...');

    try {
        const res = await fetch(`${API_BASE}/api/professor/create-quiz`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify({
                text: extractedText,
                title,
                difficulty,
                mcqCount: mcqEnabled ? counts.mcq : 0,
                tfCount: tfEnabled ? counts.tf : 0,
                whCount: whEnabled ? counts.wh : 0
            })
        });

        const data = await res.json();
        hideLoading();

        if (!res.ok) throw new Error(data.error);

        alert('Quiz created successfully!');
        
        // Reset form
        extractedText = '';
        document.getElementById('uploadZone').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('quizOptions').style.display = 'none';
        document.getElementById('quizTitle').value = '';

        // Switch to My Quizzes tab
        document.querySelector('[data-tab="myquizzes"]').click();
        loadProfessorQuizzes();

    } catch (error) {
        hideLoading();
        alert('Error: ' + error.message);
    }
}

async function loadProfessorQuizzes() {
    try {
        const res = await fetch(`${API_BASE}/api/professor/quizzes`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();

        const container = document.getElementById('professorQuizzes');
        const emptyState = document.getElementById('noQuizzes');

        if (!data.quizzes || data.quizzes.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = data.quizzes.map(quiz => `
            <div class="quiz-card">
                <div class="quiz-card-title">${quiz.title}</div>
                <div class="quiz-card-meta">
                    <span class="quiz-badge ${quiz.difficulty}">${quiz.difficulty}</span>
                    <span class="quiz-badge questions">${(quiz.mcqQuestions?.length || 0) + (quiz.tfQuestions?.length || 0) + (quiz.whQuestions?.length || 0)} questions</span>
                </div>
                <div class="quiz-card-stats">
                    <span>📊 ${quiz.attemptCount || 0} attempts</span>
                    <span>📈 Avg: ${quiz.avgScore || 0}%</span>
                </div>
                <div class="quiz-card-actions">
                    <button class="quiz-btn delete" onclick="deleteQuiz('${quiz._id}')">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading quizzes:', error);
    }
}

async function deleteQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this quiz?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/professor/quiz/${quizId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });

        if (res.ok) {
            loadProfessorQuizzes();
        }
    } catch (error) {
        alert('Error deleting quiz');
    }
}

// ==================== STUDENT FUNCTIONS ====================

function showStudentDashboard() {
    document.getElementById('studentDashboard').style.display = 'block';
    document.getElementById('professorDashboard').style.display = 'none';
    document.getElementById('quizView').style.display = 'none';
    document.getElementById('resultView').style.display = 'none';
    loadStudentStats();
    loadAvailableQuizzes();
    loadStudentResults();
}

async function loadStudentStats() {
    try {
        const res = await fetch(`${API_BASE}/api/student/stats`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();

        if (data.stats) {
            document.getElementById('totalQuizzes').textContent = data.stats.totalQuizzes;
            document.getElementById('avgScore').textContent = data.stats.avgScore + '%';
            document.getElementById('bestScore').textContent = data.stats.bestScore + '%';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadAvailableQuizzes() {
    try {
        const res = await fetch(`${API_BASE}/api/student/quizzes`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();

        const container = document.getElementById('availableQuizzes');
        const emptyState = document.getElementById('noAvailableQuizzes');

        if (!data.quizzes || data.quizzes.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = data.quizzes.map(quiz => `
            <div class="quiz-list-item">
                <div class="quiz-list-info">
                    <div class="quiz-list-title">${quiz.title}</div>
                    <div class="quiz-list-meta">
                        <span>👨‍🏫 ${quiz.professorName || 'Professor'}</span>
                        <span>📝 ${quiz.questionCount} questions</span>
                        <span class="quiz-badge ${quiz.difficulty}">${quiz.difficulty}</span>
                    </div>
                </div>
                ${quiz.attempted 
                    ? '<button class="quiz-btn completed">✓ Completed</button>'
                    : `<button class="quiz-btn take" onclick="startQuiz('${quiz._id}')">Take Quiz</button>`
                }
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading quizzes:', error);
    }
}

async function loadStudentResults() {
    try {
        const res = await fetch(`${API_BASE}/api/student/attempts`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();

        const container = document.getElementById('studentResults');
        const emptyState = document.getElementById('noResults');

        if (!data.attempts || data.attempts.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = data.attempts.map(attempt => {
            const scoreClass = attempt.percentage >= 70 ? 'high' : attempt.percentage >= 40 ? 'medium' : 'low';
            return `
                <div class="result-item">
                    <div class="result-score-badge ${scoreClass}">${attempt.percentage}%</div>
                    <div class="result-info">
                        <div class="result-title">${attempt.quiz?.title || 'Quiz'}</div>
                        <div class="result-meta">
                            ${attempt.score}/${attempt.totalQuestions} correct • ${new Date(attempt.completedAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading results:', error);
    }
}

async function startQuiz(quizId) {
    showLoading('Loading quiz...');

    try {
        const res = await fetch(`${API_BASE}/api/student/quiz/${quizId}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();
        hideLoading();

        if (!res.ok) throw new Error(data.error);

        currentQuiz = data.quiz;
        userAnswers = {};
        displayQuiz();

    } catch (error) {
        hideLoading();
        alert('Error: ' + error.message);
    }
}

function displayQuiz() {
    document.getElementById('studentDashboard').style.display = 'none';
    document.getElementById('quizView').style.display = 'block';

    document.getElementById('quizViewTitle').textContent = currentQuiz.title;
    document.getElementById('quizViewDifficulty').textContent = currentQuiz.difficulty;
    document.getElementById('quizViewDifficulty').className = 'quiz-difficulty ' + currentQuiz.difficulty;

    const container = document.getElementById('quizQuestions');
    let html = '';
    let questionNum = 1;

    // MCQ Questions
    currentQuiz.mcqQuestions?.forEach((q, i) => {
        html += `
            <div class="question-card" data-type="mcq" data-index="${i}">
                <div class="question-number">${questionNum++}</div>
                <span class="question-type-badge">MCQ</span>
                <p class="question-text">${q.question}</p>
                <div class="options-list">
                    ${q.options.map((opt, oi) => `
                        <div class="option-item" onclick="selectOption(this, 'mcq', ${i}, ${oi})">
                            <div class="option-radio"></div>
                            <span>${opt.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    // TF Questions
    currentQuiz.tfQuestions?.forEach((q, i) => {
        html += `
            <div class="question-card" data-type="tf" data-index="${i}">
                <div class="question-number">${questionNum++}</div>
                <span class="question-type-badge">True/False</span>
                <p class="question-text">${q.question}</p>
                <div class="tf-options">
                    <button class="tf-btn" onclick="selectTF(this, ${i}, true)">✓ True</button>
                    <button class="tf-btn" onclick="selectTF(this, ${i}, false)">✗ False</button>
                </div>
            </div>
        `;
    });

    // WH Questions
    currentQuiz.whQuestions?.forEach((q, i) => {
        html += `
            <div class="question-card" data-type="wh" data-index="${i}">
                <div class="question-number">${questionNum++}</div>
                <span class="question-type-badge">Short Answer</span>
                <p class="question-text">${q.question}</p>
                <textarea class="wh-input" placeholder="Type your answer..." onchange="saveWHAnswer(${i}, this.value)"></textarea>
            </div>
        `;
    });

    container.innerHTML = html;
}

function selectOption(element, type, qIndex, optIndex) {
    const card = element.closest('.question-card');
    card.querySelectorAll('.option-item').forEach(o => o.classList.remove('selected'));
    element.classList.add('selected');
    
    if (!userAnswers.mcq) userAnswers.mcq = {};
    userAnswers.mcq[qIndex] = optIndex;
}

function selectTF(element, qIndex, value) {
    const card = element.closest('.question-card');
    card.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
    element.classList.add('selected');
    
    if (!userAnswers.tf) userAnswers.tf = {};
    userAnswers.tf[qIndex] = value;
}

function saveWHAnswer(qIndex, value) {
    if (!userAnswers.wh) userAnswers.wh = {};
    userAnswers.wh[qIndex] = value;
}

async function submitQuiz() {
    let score = 0;
    let total = 0;

    // Grade MCQ
    currentQuiz.mcqQuestions?.forEach((q, i) => {
        total++;
        const userAnswer = userAnswers.mcq?.[i];
        if (userAnswer !== undefined && q.options[userAnswer]?.isCorrect) {
            score++;
        }
    });

    // Grade TF
    currentQuiz.tfQuestions?.forEach((q, i) => {
        total++;
        if (userAnswers.tf?.[i] === q.answer) {
            score++;
        }
    });

    // WH questions counted but not auto-graded
    currentQuiz.whQuestions?.forEach(() => {
        total++;
        // Give credit if answered
        // In real app, this would need manual grading
    });

    showLoading('Submitting quiz...');

    try {
        const res = await fetch(`${API_BASE}/api/student/submit-quiz`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify({
                quizId: currentQuiz._id,
                answers: userAnswers,
                score,
                totalQuestions: total
            })
        });

        hideLoading();

        const percentage = Math.round((score / total) * 100);
        showResult(percentage, score, total);

    } catch (error) {
        hideLoading();
        alert('Error submitting quiz');
    }
}

function showResult(percentage, score, total) {
    document.getElementById('quizView').style.display = 'none';
    document.getElementById('resultView').style.display = 'block';

    document.getElementById('resultScore').textContent = percentage + '%';
    document.getElementById('correctCount').textContent = score;
    document.getElementById('totalCount').textContent = total;

    let message = 'Keep practicing!';
    if (percentage >= 80) message = 'Excellent work! 🎉';
    else if (percentage >= 60) message = 'Good job! 👍';
    else if (percentage >= 40) message = 'Nice try! 📚';

    document.getElementById('resultMessage').textContent = message;
}

// ==================== UTILITY FUNCTIONS ====================

function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Make functions globally available
window.deleteQuiz = deleteQuiz;
window.startQuiz = startQuiz;
window.selectOption = selectOption;
window.selectTF = selectTF;
window.saveWHAnswer = saveWHAnswer;


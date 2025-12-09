// ===== Configuration =====
// Auto-detect API base URL
const API_BASE = window.location.protocol === 'file:' 
    ? 'http://localhost:5000' 
    : window.location.origin;

console.log('🌐 API Base URL:', API_BASE);

// ===== Authentication Check =====
function checkAuth() {
    const token = localStorage.getItem('quizforge_token');
    const user = localStorage.getItem('quizforge_user');
    
    if (!token || !user) {
        // Redirect to login page
        if (window.location.protocol === 'file:') {
            window.location.href = 'login.html';
        } else {
            window.location.href = '/login';
        }
        return null;
    }
    
    return JSON.parse(user);
}

function setupUserUI() {
    const user = checkAuth();
    if (!user) return;
    
    // Update user info display
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    
    if (userNameEl) userNameEl.textContent = user.name;
    if (userRoleEl) {
        userRoleEl.textContent = user.role;
        userRoleEl.className = 'user-role ' + user.role;
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('quizforge_token');
            localStorage.removeItem('quizforge_user');
            if (window.location.protocol === 'file:') {
                window.location.href = 'login.html';
            } else {
                window.location.href = '/login';
            }
        });
    }
}

// Check auth on page load
setupUserUI();

// ===== State =====
let currentFile = null;
let extractedText = '';
let whCount = 5;
let mcqCount = 5;
let tfCount = 5;
let difficulty = 'medium';
let whEnabled = true;
let mcqEnabled = true;
let tfEnabled = false;
let currentQuiz = null;
let userAnswers = {
    wh: {},
    mcq: {},
    tf: {}
};

// ===== DOM Elements =====
const dropZone = document.getElementById('dropZone');
const pdfInput = document.getElementById('pdfInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFile');
const generateBtn = document.getElementById('generateBtn');
const extractionStatus = document.getElementById('extractionStatus');

// Count elements
const whCountEl = document.getElementById('whCount');
const mcqCountEl = document.getElementById('mcqCount');
const tfCountEl = document.getElementById('tfCount');

// Toggle elements
const whToggle = document.getElementById('whToggle');
const mcqToggle = document.getElementById('mcqToggle');
const tfToggle = document.getElementById('tfToggle');

// Counter groups
const whCounterGroup = document.getElementById('whCounterGroup');
const mcqCounterGroup = document.getElementById('mcqCounterGroup');
const tfCounterGroup = document.getElementById('tfCounterGroup');

// Cards
const whCard = document.getElementById('whCard');
const mcqCard = document.getElementById('mcqCard');
const tfCard = document.getElementById('tfCard');

// Sections
const uploadSection = document.getElementById('upload-section');
const loadingSection = document.getElementById('loading-section');
const quizSection = document.getElementById('quiz-section');
const historySection = document.getElementById('history-section');

// Loading
const loadingStatus = document.getElementById('loadingStatus');
const progressBar = document.getElementById('progressBar');

// Quiz
const questionTabs = document.getElementById('questionTabs');
const whQuestionsContainer = document.getElementById('whQuestions');
const mcqQuestionsContainer = document.getElementById('mcqQuestions');
const tfQuestionsContainer = document.getElementById('tfQuestions');
const submitQuizBtn = document.getElementById('submitQuiz');
const scoreSection = document.getElementById('scoreSection');
const scoreValue = document.getElementById('scoreValue');
const scoreCircle = document.getElementById('scoreCircle');
const scoreMessage = document.getElementById('scoreMessage');
const retryBtn = document.getElementById('retryBtn');
const backBtn = document.getElementById('backBtn');
const quizDifficulty = document.getElementById('quizDifficulty');

// History
const historyGrid = document.getElementById('historyGrid');
const emptyHistory = document.getElementById('emptyHistory');

// ===== Initialize =====
function init() {
    updateCardStates();
    setupEventListeners();
    showSection('upload');
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            navigateTo(section);
        });
    });

    // Drag and Drop
    dropZone.addEventListener('click', () => pdfInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            handleFile(files[0]);
        }
    });

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    removeFileBtn.addEventListener('click', () => {
        resetFileUpload();
    });

    // Difficulty selection
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            difficulty = e.target.value;
            console.log('📊 Difficulty set to:', difficulty);
        });
    });

    // Toggle switches
    whToggle.addEventListener('change', () => {
        whEnabled = whToggle.checked;
        updateCardStates();
        updateGenerateButton();
    });

    mcqToggle.addEventListener('change', () => {
        mcqEnabled = mcqToggle.checked;
        updateCardStates();
        updateGenerateButton();
    });

    tfToggle.addEventListener('change', () => {
        tfEnabled = tfToggle.checked;
        updateCardStates();
        updateGenerateButton();
    });

    // Counter buttons
    document.querySelectorAll('.counter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const target = btn.dataset.target;
            
            if (target === 'whCount' && whEnabled) {
                if (action === 'increase' && whCount < 15) whCount++;
                if (action === 'decrease' && whCount > 1) whCount--;
                whCountEl.textContent = whCount;
            } else if (target === 'mcqCount' && mcqEnabled) {
                if (action === 'increase' && mcqCount < 15) mcqCount++;
                if (action === 'decrease' && mcqCount > 1) mcqCount--;
                mcqCountEl.textContent = mcqCount;
            } else if (target === 'tfCount' && tfEnabled) {
                if (action === 'increase' && tfCount < 15) tfCount++;
                if (action === 'decrease' && tfCount > 1) tfCount--;
                tfCountEl.textContent = tfCount;
            }
        });
    });

    // Generate button
    generateBtn.addEventListener('click', generateQuiz);

    // Submit quiz
    submitQuizBtn.addEventListener('click', submitQuiz);

    // Retry
    retryBtn.addEventListener('click', () => {
        resetQuiz();
    });

    // Back button
    backBtn.addEventListener('click', () => {
        navigateTo('upload');
        resetAll();
    });
}

function updateCardStates() {
    // WH Card
    if (whEnabled) {
        whCard.classList.add('active');
        whCounterGroup.classList.remove('disabled');
    } else {
        whCard.classList.remove('active');
        whCounterGroup.classList.add('disabled');
    }

    // MCQ Card
    if (mcqEnabled) {
        mcqCard.classList.add('active');
        mcqCounterGroup.classList.remove('disabled');
    } else {
        mcqCard.classList.remove('active');
        mcqCounterGroup.classList.add('disabled');
    }

    // TF Card
    if (tfEnabled) {
        tfCard.classList.add('active');
        tfCounterGroup.classList.remove('disabled');
    } else {
        tfCard.classList.remove('active');
        tfCounterGroup.classList.add('disabled');
    }
}

function updateGenerateButton() {
    const hasText = extractedText && extractedText.trim().length > 10;
    const hasQuestionType = whEnabled || mcqEnabled || tfEnabled;
    generateBtn.disabled = !(hasText && hasQuestionType);
}

// ===== Functions =====

function navigateTo(section) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    if (section === 'upload') {
        uploadSection.classList.add('active');
    } else if (section === 'history') {
        historySection.classList.add('active');
        loadHistory();
    }
}

async function handleFile(file) {
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    dropZone.style.display = 'none';
    fileInfo.style.display = 'block';
    
    // Show loading state
    extractionStatus.innerHTML = `
        <span class="status-icon">⏳</span>
        <span class="status-text">Extracting text from PDF...</span>
    `;
    extractionStatus.classList.remove('error');
    generateBtn.disabled = true;
    
    // Upload and extract text immediately
    try {
        const formData = new FormData();
        formData.append('pdf', file);
        
        console.log('📤 Uploading PDF:', file.name);
        
        const response = await fetch(`${API_BASE}/upload-pdf`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to extract text');
        }
        
        extractedText = data.text;
        console.log('✅ Text extracted, length:', extractedText.length);
        
        extractionStatus.innerHTML = `
            <span class="status-icon">✓</span>
            <span class="status-text">Text extracted successfully (${data.pageCount} pages, ${extractedText.length.toLocaleString()} characters)</span>
        `;
        extractionStatus.classList.remove('error');
        updateGenerateButton();
        
    } catch (error) {
        console.error('❌ Extraction error:', error);
        extractedText = '';
        extractionStatus.innerHTML = `
            <span class="status-icon">✗</span>
            <span class="status-text">${error.message}</span>
        `;
        extractionStatus.classList.add('error');
        updateGenerateButton();
    }
}

function resetFileUpload() {
    currentFile = null;
    extractedText = '';
    pdfInput.value = '';
    dropZone.style.display = 'block';
    fileInfo.style.display = 'none';
    updateGenerateButton();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    switch (sectionName) {
        case 'upload':
            uploadSection.classList.add('active');
            break;
        case 'loading':
            loadingSection.classList.add('active');
            break;
        case 'quiz':
            quizSection.classList.add('active');
            break;
        case 'history':
            historySection.classList.add('active');
            break;
    }
}

function updateProgress(percent, status) {
    progressBar.style.width = percent + '%';
    loadingStatus.textContent = status;
}

async function generateQuiz() {
    if (!extractedText || extractedText.trim().length < 10) {
        alert('Please upload a PDF with readable text content');
        return;
    }
    if (!whEnabled && !mcqEnabled && !tfEnabled) {
        alert('Please select at least one question type');
        return;
    }
    
    showSection('loading');
    updateProgress(20, 'Preparing content...');
    
    try {
        updateProgress(40, `Generating ${difficulty} level questions...`);
        
        console.log('📝 Generating quiz with text length:', extractedText.length);
        console.log('📊 Difficulty:', difficulty);
        console.log('❓ Question types:', { wh: whEnabled ? whCount : 0, mcq: mcqEnabled ? mcqCount : 0, tf: tfEnabled ? tfCount : 0 });
        
        const quizRes = await fetch(`${API_BASE}/generate-complete-quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: extractedText,
                title: currentFile ? currentFile.name.replace('.pdf', '') : 'Quiz',
                whCount: whEnabled ? whCount : 0,
                mcqCount: mcqEnabled ? mcqCount : 0,
                tfCount: tfEnabled ? tfCount : 0,
                difficulty: difficulty
            })
        });
        
        updateProgress(80, 'Processing results...');
        
        if (!quizRes.ok) {
            const errorData = await quizRes.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to generate quiz');
        }
        
        const quizData = await quizRes.json();
        currentQuiz = quizData.quiz;
        
        console.log('✅ Quiz generated:', currentQuiz);
        updateProgress(100, 'Done!');
        
        setTimeout(() => {
            displayQuiz(currentQuiz);
            showSection('quiz');
        }, 500);
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error generating quiz: ' + error.message);
        showSection('upload');
    }
}

function displayQuiz(quiz) {
    // Reset state
    userAnswers = { wh: {}, mcq: {}, tf: {} };
    scoreSection.style.display = 'none';
    submitQuizBtn.style.display = 'flex';
    
    // Set title
    document.getElementById('quizTitle').textContent = quiz.title || 'Your Quiz';
    
    // Set difficulty badge
    const diffLevel = quiz.difficulty || 'medium';
    quizDifficulty.textContent = diffLevel.charAt(0).toUpperCase() + diffLevel.slice(1);
    quizDifficulty.className = 'quiz-difficulty ' + diffLevel;
    
    // Build tabs dynamically
    questionTabs.innerHTML = '';
    const hasWh = quiz.whQuestions && quiz.whQuestions.length > 0;
    const hasMcq = quiz.mcqQuestions && quiz.mcqQuestions.length > 0;
    const hasTf = quiz.tfQuestions && quiz.tfQuestions.length > 0;
    
    let firstTab = null;
    
    if (hasWh) {
        const tab = createTab('wh', '❓', 'WH Questions', quiz.whQuestions.length);
        questionTabs.appendChild(tab);
        if (!firstTab) firstTab = 'wh';
    }
    
    if (hasMcq) {
        const tab = createTab('mcq', '🔘', 'Multiple Choice', quiz.mcqQuestions.length);
        questionTabs.appendChild(tab);
        if (!firstTab) firstTab = 'mcq';
    }
    
    if (hasTf) {
        const tab = createTab('tf', '✓✗', 'True / False', quiz.tfQuestions.length);
        questionTabs.appendChild(tab);
        if (!firstTab) firstTab = 'tf';
    }
    
    // Add tab click listeners
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            showQuestionContainer(tab);
        });
    });
    
    // Display WH questions
    whQuestionsContainer.innerHTML = '';
    if (hasWh) {
        quiz.whQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.innerHTML = `
                <div class="question-number">${index + 1}</div>
                <p class="question-text">${q.question}</p>
                <textarea class="answer-input" placeholder="Type your answer here..." data-index="${index}" data-type="wh"></textarea>
                <div class="answer-reveal" id="wh-answer-${index}">
                    <div class="answer-label">Correct Answer</div>
                    <div class="answer-text">${q.answer}</div>
                </div>
            `;
            whQuestionsContainer.appendChild(card);
        });
    }
    
    // Add input listeners for WH questions
    document.querySelectorAll('.answer-input[data-type="wh"]').forEach(input => {
        input.addEventListener('input', (e) => {
            userAnswers.wh[e.target.dataset.index] = e.target.value;
        });
    });
    
    // Display MCQ questions
    mcqQuestionsContainer.innerHTML = '';
    if (hasMcq) {
        quiz.mcqQuestions.forEach((q, index) => {
            const letters = ['A', 'B', 'C', 'D'];
            const optionsHtml = q.options.map((opt, optIndex) => `
                <div class="mcq-option" data-question="${index}" data-option="${optIndex}" data-correct="${opt.isCorrect}">
                    <div class="option-radio"></div>
                    <span class="option-letter">${letters[optIndex]}.</span>
                    <span class="option-text">${opt.text}</span>
                </div>
            `).join('');
            
            const card = document.createElement('div');
            card.className = 'question-card';
            card.innerHTML = `
                <div class="question-number">${index + 1}</div>
                <p class="question-text">${q.question}</p>
                <div class="mcq-options">
                    ${optionsHtml}
                </div>
                <div class="explanation" id="mcq-explanation-${index}">
                    <div class="explanation-label">Explanation</div>
                    <div class="explanation-text">${q.explanation || 'The correct answer is highlighted above.'}</div>
                </div>
            `;
            mcqQuestionsContainer.appendChild(card);
        });
    }
    
    // Add click listeners for MCQ options
    document.querySelectorAll('.mcq-option').forEach(option => {
        option.addEventListener('click', () => {
            const questionIndex = option.dataset.question;
            const optionIndex = option.dataset.option;
            
            // Remove selected from siblings
            document.querySelectorAll(`.mcq-option[data-question="${questionIndex}"]`).forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Add selected to clicked
            option.classList.add('selected');
            userAnswers.mcq[questionIndex] = parseInt(optionIndex);
        });
    });
    
    // Display True/False questions
    tfQuestionsContainer.innerHTML = '';
    if (hasTf) {
        quiz.tfQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.innerHTML = `
                <div class="question-number">${index + 1}</div>
                <p class="question-text">${q.question}</p>
                <div class="tf-options">
                    <div class="tf-option" data-question="${index}" data-value="true" data-correct="${q.answer === true}">
                        <span class="tf-icon">✓</span>
                        <span>True</span>
                    </div>
                    <div class="tf-option" data-question="${index}" data-value="false" data-correct="${q.answer === false}">
                        <span class="tf-icon">✗</span>
                        <span>False</span>
                    </div>
                </div>
                <div class="explanation" id="tf-explanation-${index}">
                    <div class="explanation-label">Explanation</div>
                    <div class="explanation-text">${q.explanation || 'See the correct answer above.'}</div>
                </div>
            `;
            tfQuestionsContainer.appendChild(card);
        });
    }
    
    // Add click listeners for TF options
    document.querySelectorAll('.tf-option').forEach(option => {
        option.addEventListener('click', () => {
            const questionIndex = option.dataset.question;
            const value = option.dataset.value === 'true';
            
            // Remove selected from siblings
            document.querySelectorAll(`.tf-option[data-question="${questionIndex}"]`).forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Add selected to clicked
            option.classList.add('selected');
            userAnswers.tf[questionIndex] = value;
        });
    });
    
    // Activate first tab
    if (firstTab) {
        document.querySelector(`[data-tab="${firstTab}"]`)?.classList.add('active');
        showQuestionContainer(firstTab);
    }
}

function createTab(id, icon, name, count) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = id;
    btn.innerHTML = `
        <span class="tab-icon">${icon}</span>
        ${name}
        <span class="tab-count">${count}</span>
    `;
    return btn;
}

function showQuestionContainer(type) {
    whQuestionsContainer.style.display = 'none';
    mcqQuestionsContainer.style.display = 'none';
    tfQuestionsContainer.style.display = 'none';
    
    if (type === 'wh') whQuestionsContainer.style.display = 'flex';
    else if (type === 'mcq') mcqQuestionsContainer.style.display = 'flex';
    else if (type === 'tf') tfQuestionsContainer.style.display = 'flex';
}

function submitQuiz() {
    if (!currentQuiz) return;
    
    let correctCount = 0;
    let totalCount = 0;
    
    // Check MCQ answers
    if (currentQuiz.mcqQuestions && currentQuiz.mcqQuestions.length > 0) {
        currentQuiz.mcqQuestions.forEach((q, index) => {
            totalCount++;
            const userAnswer = userAnswers.mcq[index];
            const options = document.querySelectorAll(`.mcq-option[data-question="${index}"]`);
            
            options.forEach((opt, optIndex) => {
                opt.style.pointerEvents = 'none';
                
                if (opt.dataset.correct === 'true') {
                    opt.classList.add('correct');
                    if (userAnswer === optIndex) {
                        correctCount++;
                    }
                } else if (userAnswer === optIndex) {
                    opt.classList.add('incorrect');
                }
            });
            
            // Show explanation
            document.getElementById(`mcq-explanation-${index}`)?.classList.add('show');
        });
    }
    
    // Check True/False answers
    if (currentQuiz.tfQuestions && currentQuiz.tfQuestions.length > 0) {
        currentQuiz.tfQuestions.forEach((q, index) => {
            totalCount++;
            const userAnswer = userAnswers.tf[index];
            const options = document.querySelectorAll(`.tf-option[data-question="${index}"]`);
            
            options.forEach(opt => {
                opt.style.pointerEvents = 'none';
                
                if (opt.dataset.correct === 'true') {
                    opt.classList.add('correct');
                    if (userAnswer === (opt.dataset.value === 'true')) {
                        correctCount++;
                    }
                } else if (userAnswer === (opt.dataset.value === 'true')) {
                    opt.classList.add('incorrect');
                }
            });
            
            // Show explanation
            document.getElementById(`tf-explanation-${index}`)?.classList.add('show');
        });
    }
    
    // Show WH answers (not scored, just revealed)
    if (currentQuiz.whQuestions && currentQuiz.whQuestions.length > 0) {
        currentQuiz.whQuestions.forEach((q, index) => {
            document.getElementById(`wh-answer-${index}`)?.classList.add('show');
        });
        
        // Disable WH inputs
        document.querySelectorAll('.answer-input').forEach(input => {
            input.disabled = true;
        });
    }
    
    // Calculate and show score
    const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    showScore(score, correctCount, totalCount);
    
    // Hide submit button
    submitQuizBtn.style.display = 'none';
}

function showScore(percent, correct, total) {
    scoreSection.style.display = 'block';
    scoreValue.textContent = percent;
    
    // Animate the score circle
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (percent / 100) * circumference;
    
    // Add gradient definition to SVG if not exists
    const svg = scoreCircle.closest('svg');
    if (!svg.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff6b35"/>
                <stop offset="100%" stop-color="#f7c548"/>
            </linearGradient>
        `;
        svg.insertBefore(defs, svg.firstChild);
    }
    
    scoreCircle.style.stroke = 'url(#scoreGradient)';
    setTimeout(() => {
        scoreCircle.style.strokeDashoffset = offset;
    }, 100);
    
    // Set message
    let message = '';
    if (total === 0) {
        message = 'Review your WH question answers above!';
    } else if (percent >= 80) {
        message = `Excellent! You got ${correct} out of ${total} questions correct!`;
    } else if (percent >= 60) {
        message = `Good job! You got ${correct} out of ${total} questions correct.`;
    } else if (percent >= 40) {
        message = `Nice try! You got ${correct} out of ${total} questions correct.`;
    } else {
        message = `Keep practicing! You got ${correct} out of ${total} questions correct.`;
    }
    scoreMessage.textContent = message;
    
    // Scroll to score
    scoreSection.scrollIntoView({ behavior: 'smooth' });
}

function resetQuiz() {
    userAnswers = { wh: {}, mcq: {}, tf: {} };
    scoreSection.style.display = 'none';
    submitQuizBtn.style.display = 'flex';
    scoreCircle.style.strokeDashoffset = 283;
    
    // Reset MCQ options
    document.querySelectorAll('.mcq-option').forEach(opt => {
        opt.classList.remove('selected', 'correct', 'incorrect');
        opt.style.pointerEvents = 'auto';
    });
    
    // Reset TF options
    document.querySelectorAll('.tf-option').forEach(opt => {
        opt.classList.remove('selected', 'correct', 'incorrect');
        opt.style.pointerEvents = 'auto';
    });
    
    // Hide explanations
    document.querySelectorAll('.explanation').forEach(exp => {
        exp.classList.remove('show');
    });
    
    // Hide WH answers and reset inputs
    document.querySelectorAll('.answer-reveal').forEach(ans => {
        ans.classList.remove('show');
    });
    
    document.querySelectorAll('.answer-input').forEach(input => {
        input.disabled = false;
        input.value = '';
    });
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAll() {
    currentFile = null;
    extractedText = '';
    currentQuiz = null;
    userAnswers = { wh: {}, mcq: {}, tf: {} };
    resetFileUpload();
}

async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/quizzes`);
        const data = await res.json();
        
        if (data.quizzes && data.quizzes.length > 0) {
            emptyHistory.style.display = 'none';
            historyGrid.style.display = 'grid';
            historyGrid.innerHTML = '';
            
            data.quizzes.forEach(quiz => {
                const diffClass = quiz.difficulty || 'medium';
                const card = document.createElement('div');
                card.className = 'history-card';
                card.innerHTML = `
                    <h4 class="history-card-title">${quiz.title}</h4>
                    <div class="history-card-meta">
                        <span class="history-difficulty ${diffClass}">${diffClass}</span>
                        <span class="history-card-date">${formatDate(quiz.createdAt)}</span>
                    </div>
                `;
                card.addEventListener('click', () => loadQuizById(quiz._id));
                historyGrid.appendChild(card);
            });
        } else {
            historyGrid.style.display = 'none';
            emptyHistory.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        historyGrid.style.display = 'none';
        emptyHistory.style.display = 'block';
    }
}

async function loadQuizById(id) {
    try {
        const res = await fetch(`${API_BASE}/quiz/${id}`);
        const data = await res.json();
        
        if (data.quiz) {
            currentQuiz = data.quiz;
            displayQuiz(currentQuiz);
            showSection('quiz');
            
            // Update nav
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        }
    } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Failed to load quiz');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('en-US', options);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
